//! Change request CRUD — raised when a scope warning is acted on.
//!
//! Flow:
//!   Client taps "Raise Change Request" on a scope_warning card
//!     → POST /change-requests             (creates PENDING row)
//!     → Freelancer sees it in chat sidebar
//!     → PATCH /change-requests/{id}/respond  (APPROVED or REJECTED)
//!     → On APPROVED: deployments.escrow_amount_cents += price_delta_cents

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::Arc;
use uuid::Uuid;

use crate::handlers::AppState;

fn extract_profile_id(headers: &HeaderMap) -> Result<Uuid, (StatusCode, String)> {
    let val = headers
        .get("x-profile-id")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "Missing X-Profile-Id".to_string()))?;
    Uuid::parse_str(val)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid X-Profile-Id".to_string()))
}

// ── Request / response types ──────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateCrBody {
    pub deployment_id:      Uuid,
    /// The scope_warning message that triggered this CR (optional for manual CRs).
    pub trigger_message_id: Option<Uuid>,
    pub description:        String,
    /// Net price change in USD cents.  May be 0 for scope-only changes.
    pub price_delta_cents:  i64,
}

#[derive(Deserialize)]
pub struct ListCrQuery {
    pub deployment_id: Uuid,
}

#[derive(Deserialize)]
pub struct RespondBody {
    /// "APPROVED" | "REJECTED"
    pub status: String,
}

#[derive(Serialize)]
pub struct ChangeRequestRow {
    pub id:                 Uuid,
    pub deployment_id:      Uuid,
    pub trigger_message_id: Option<Uuid>,
    pub description:        String,
    pub price_delta_cents:  i64,
    pub status:             String,
    pub raised_by:          Uuid,
    pub responded_by:       Option<Uuid>,
    pub created_at:         String,
    pub updated_at:         String,
}

// ── POST /change-requests ─────────────────────────────────────────────────────

pub async fn create_change_request(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CreateCrBody>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, String)> {
    let profile_id = extract_profile_id(&headers)?;

    // Verify caller is a participant.
    let ok: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM deployments
          WHERE id = $1 AND (client_id = $2 OR freelancer_id = $2 OR developer_id = $2))",
    )
    .bind(body.deployment_id)
    .bind(profile_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if !ok {
        return Err((StatusCode::FORBIDDEN, "Not a deployment participant".to_string()));
    }

    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO change_requests
             (deployment_id, trigger_message_id, description, price_delta_cents, raised_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id",
    )
    .bind(body.deployment_id)
    .bind(body.trigger_message_id)
    .bind(&body.description)
    .bind(body.price_delta_cents)
    .bind(profile_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tracing::info!(
        cr_id         = %id,
        deployment_id = %body.deployment_id,
        delta_cents   = body.price_delta_cents,
        "Change request created"
    );

    Ok((StatusCode::CREATED, Json(serde_json::json!({ "id": id }))))
}

// ── GET /change-requests?deployment_id= ──────────────────────────────────────

pub async fn list_change_requests(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(q): Query<ListCrQuery>,
) -> Result<Json<Vec<ChangeRequestRow>>, (StatusCode, String)> {
    let profile_id = extract_profile_id(&headers)?;

    let ok: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM deployments
          WHERE id = $1 AND (client_id = $2 OR freelancer_id = $2 OR developer_id = $2))",
    )
    .bind(q.deployment_id)
    .bind(profile_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if !ok {
        return Err((StatusCode::FORBIDDEN, "Not a deployment participant".to_string()));
    }

    let rows = sqlx::query(
        "SELECT id, deployment_id, trigger_message_id, description,
                price_delta_cents, status, raised_by, responded_by,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS created_at,
                to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS updated_at
         FROM change_requests
         WHERE deployment_id = $1
         ORDER BY created_at ASC",
    )
    .bind(q.deployment_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let crs = rows
        .iter()
        .map(|r| {
            Ok(ChangeRequestRow {
                id:                 r.try_get("id")?,
                deployment_id:      r.try_get("deployment_id")?,
                trigger_message_id: r.try_get("trigger_message_id")?,
                description:        r.try_get("description")?,
                price_delta_cents:  r.try_get("price_delta_cents")?,
                status:             r.try_get("status")?,
                raised_by:          r.try_get("raised_by")?,
                responded_by:       r.try_get("responded_by")?,
                created_at:         r.try_get("created_at")?,
                updated_at:         r.try_get("updated_at")?,
            })
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(crs))
}

// ── PATCH /change-requests/{id}/respond ──────────────────────────────────────

pub async fn respond_change_request(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(body): Json<RespondBody>,
) -> impl IntoResponse {
    let profile_id = match extract_profile_id(&headers) {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };

    let status = body.status.to_uppercase();
    if status != "APPROVED" && status != "REJECTED" {
        return (StatusCode::BAD_REQUEST, "status must be APPROVED or REJECTED").into_response();
    }

    // Fetch the CR to verify the caller participates in its deployment.
    let cr_row = sqlx::query(
        "SELECT cr.deployment_id, cr.price_delta_cents, cr.status
         FROM change_requests cr
         JOIN deployments d ON d.id = cr.deployment_id
         WHERE cr.id = $1
           AND (d.client_id = $2 OR d.freelancer_id = $2 OR d.developer_id = $2)",
    )
    .bind(id)
    .bind(profile_id)
    .fetch_optional(&state.db)
    .await;

    let row = match cr_row {
        Ok(Some(r)) => r,
        Ok(None) => return (StatusCode::NOT_FOUND, "Change request not found or access denied").into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let current_status: String = row.try_get("status").unwrap_or_default();
    if current_status != "PENDING" {
        return (StatusCode::CONFLICT, "Change request is no longer PENDING").into_response();
    }

    let deployment_id: Uuid = row.try_get("deployment_id").unwrap();
    let price_delta: i64    = row.try_get("price_delta_cents").unwrap_or(0);

    // Atomically update the CR and (on approval) bump the escrow.
    let mut tx = match state.db.begin().await {
        Ok(t) => t,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let update_res = sqlx::query(
        "UPDATE change_requests
         SET status = $1, responded_by = $2, updated_at = NOW()
         WHERE id = $3",
    )
    .bind(&status)
    .bind(profile_id)
    .bind(id)
    .execute(&mut *tx)
    .await;

    if let Err(e) = update_res {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    if status == "APPROVED" && price_delta != 0 {
        let bump_res = sqlx::query(
            "UPDATE deployments
             SET escrow_amount_cents = escrow_amount_cents + $1, updated_at = NOW()
             WHERE id = $2",
        )
        .bind(price_delta)
        .bind(deployment_id)
        .execute(&mut *tx)
        .await;

        if let Err(e) = bump_res {
            return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    }

    if let Err(e) = tx.commit().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    tracing::info!(
        cr_id         = %id,
        deployment_id = %deployment_id,
        status        = %status,
        delta_cents   = price_delta,
        "Change request responded"
    );

    Json(serde_json::json!({ "ok": true, "status": status })).into_response()
}
