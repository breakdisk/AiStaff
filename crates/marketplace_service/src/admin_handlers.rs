//! Admin endpoints: listing moderation, deployment overview, revenue summary.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use sqlx::Row as _;
use std::sync::Arc;
use uuid::Uuid;

use crate::handlers::AppState;

// ── GET /admin/listings ───────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ListingQuery {
    /// "PENDING_REVIEW" | "APPROVED" | "REJECTED" | all
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list_listings(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ListingQuery>,
) -> impl IntoResponse {
    let limit = q.limit.unwrap_or(50).min(200);
    let offset = q.offset.unwrap_or(0);

    let rows = sqlx::query(
        "SELECT id, developer_id, name, description, price_cents, category,
                seller_type, slug, listing_status, rejection_reason,
                active, created_at
         FROM agent_listings
         WHERE ($1::TEXT IS NULL OR listing_status = $1)
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3",
    )
    .bind(&q.status)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rs) => {
            let listings: Vec<serde_json::Value> = rs
                .iter()
                .map(|r| {
                    serde_json::json!({
                        "id":               r.get::<Uuid, _>("id"),
                        "developer_id":     r.get::<Uuid, _>("developer_id"),
                        "name":             r.get::<&str, _>("name"),
                        "description":      r.get::<&str, _>("description"),
                        "price_cents":      r.get::<i64, _>("price_cents"),
                        "category":         r.get::<&str, _>("category"),
                        "seller_type":      r.get::<&str, _>("seller_type"),
                        "slug":             r.get::<&str, _>("slug"),
                        "listing_status":   r.get::<&str, _>("listing_status"),
                        "rejection_reason": r.get::<Option<String>, _>("rejection_reason"),
                        "active":           r.get::<bool, _>("active"),
                        "created_at":       r.get::<chrono::DateTime<chrono::Utc>, _>("created_at").to_rfc3339(),
                    })
                })
                .collect();
            (StatusCode::OK, Json(serde_json::json!({ "listings": listings }))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── POST /admin/listings/:id/approve ─────────────────────────────────────────

pub async fn approve_listing(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let res = sqlx::query(
        "UPDATE agent_listings
         SET listing_status = 'APPROVED', rejection_reason = NULL, updated_at = NOW()
         WHERE id = $1",
    )
    .bind(id)
    .execute(&state.db)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => StatusCode::NOT_FOUND.into_response(),
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── POST /admin/listings/:id/reject ──────────────────────────────────────────

#[derive(Deserialize)]
pub struct RejectBody {
    pub reason: String,
}

pub async fn reject_listing(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(body): Json<RejectBody>,
) -> impl IntoResponse {
    let res = sqlx::query(
        "UPDATE agent_listings
         SET listing_status = 'REJECTED', rejection_reason = $2,
             active = FALSE, updated_at = NOW()
         WHERE id = $1",
    )
    .bind(id)
    .bind(&body.reason)
    .execute(&state.db)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => StatusCode::NOT_FOUND.into_response(),
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── GET /admin/deployments ────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct DeploymentQuery {
    pub state: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list_deployments(
    State(state): State<Arc<AppState>>,
    Query(q): Query<DeploymentQuery>,
) -> impl IntoResponse {
    let limit = q.limit.unwrap_or(50).min(200);
    let offset = q.offset.unwrap_or(0);

    let rows = sqlx::query(
        "SELECT id, agent_id, client_id, freelancer_id,
                escrow_amount_cents, state::TEXT AS state,
                failure_reason, created_at, updated_at
         FROM deployments
         WHERE ($1::TEXT IS NULL OR state::TEXT = $1)
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3",
    )
    .bind(&q.state)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rs) => {
            let deps: Vec<serde_json::Value> = rs
                .iter()
                .map(|r| {
                    serde_json::json!({
                        "id":                  r.get::<Uuid, _>("id"),
                        "agent_id":            r.get::<Uuid, _>("agent_id"),
                        "client_id":           r.get::<Uuid, _>("client_id"),
                        "freelancer_id":       r.get::<Uuid, _>("freelancer_id"),
                        "escrow_amount_cents": r.get::<i64, _>("escrow_amount_cents"),
                        "state":               r.get::<&str, _>("state"),
                        "failure_reason":      r.get::<Option<String>, _>("failure_reason"),
                        "created_at":          r.get::<chrono::DateTime<chrono::Utc>, _>("created_at").to_rfc3339(),
                        "updated_at":          r.get::<chrono::DateTime<chrono::Utc>, _>("updated_at").to_rfc3339(),
                    })
                })
                .collect();
            (StatusCode::OK, Json(serde_json::json!({ "deployments": deps, "limit": limit, "offset": offset }))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── GET /admin/revenue ────────────────────────────────────────────────────────
// Summarises escrow captured across all deployments and payouts released.

pub async fn revenue_summary(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    // Total escrow captured (all non-failed/vetoed deployments)
    let totals = sqlx::query(
        "SELECT
             COUNT(*) AS total_deployments,
             COALESCE(SUM(escrow_amount_cents), 0) AS total_escrow_cents,
             COALESCE(SUM(CASE WHEN state::TEXT NOT IN ('FAILED','VETOED') THEN escrow_amount_cents ELSE 0 END), 0) AS active_escrow_cents
         FROM deployments",
    )
    .fetch_one(&state.db)
    .await;

    // Escrow released via payout
    let released = sqlx::query(
        "SELECT COALESCE(SUM(amount_cents), 0) AS released_cents, COUNT(*) AS payout_count
         FROM escrow_payouts",
    )
    .fetch_one(&state.db)
    .await;

    // Per-state breakdown
    let by_state = sqlx::query(
        "SELECT state::TEXT AS state, COUNT(*) AS cnt, COALESCE(SUM(escrow_amount_cents), 0) AS cents
         FROM deployments
         GROUP BY state
         ORDER BY cnt DESC",
    )
    .fetch_all(&state.db)
    .await;

    match (totals, released, by_state) {
        (Ok(t), Ok(r), Ok(bs)) => {
            let breakdown: Vec<serde_json::Value> = bs
                .iter()
                .map(|row| {
                    serde_json::json!({
                        "state": row.get::<&str, _>("state"),
                        "count": row.get::<i64, _>("cnt"),
                        "escrow_cents": row.get::<i64, _>("cents"),
                    })
                })
                .collect();

            (StatusCode::OK, Json(serde_json::json!({
                "total_deployments":   t.get::<i64, _>("total_deployments"),
                "total_escrow_cents":  t.get::<i64, _>("total_escrow_cents"),
                "active_escrow_cents": t.get::<i64, _>("active_escrow_cents"),
                "released_cents":      r.get::<i64, _>("released_cents"),
                "payout_count":        r.get::<i64, _>("payout_count"),
                "by_state":            breakdown,
            }))).into_response()
        }
        (Err(e), _, _) | (_, Err(e), _) | (_, _, Err(e)) => {
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
        }
    }
}
