//! Bundle CRUD handlers + admin moderation endpoints.
//!
//! All routes require org membership verified server-side.
//! Bundle state machine: PENDING_REVIEW → APPROVED (active=TRUE) → PENDING_REVIEW on item change.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row as _;
use std::sync::Arc;
use uuid::Uuid;

use crate::handlers::AppState;

// ── SQL constants (extracted for unit-testability) ─────────────────────────

pub(crate) const BUNDLE_APPROVE_SQL: &str =
    "UPDATE listing_bundles
     SET listing_status = 'APPROVED', rejection_reason = NULL,
         active = TRUE, updated_at = NOW()
     WHERE id = $1";

pub(crate) const BUNDLE_REJECT_SQL: &str =
    "UPDATE listing_bundles
     SET listing_status = 'REJECTED', rejection_reason = $2,
         active = FALSE, updated_at = NOW()
     WHERE id = $1";

// ── Request / Response types ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateBundleBody {
    pub name:        String,
    pub description: Option<String>,
    pub price_cents: i64,
    pub listing_ids: Vec<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBundleBody {
    pub name:        Option<String>,
    pub description: Option<String>,
    pub price_cents: Option<i64>,
    pub listing_ids: Option<Vec<Uuid>>,
}

#[derive(Debug, Deserialize)]
pub struct RejectBundleBody {
    pub reason: String,
}

#[derive(Debug, Serialize)]
pub struct BundleItem {
    pub listing_id:    String,
    pub name:          String,
    pub price_cents:   i64,
    pub display_order: i32,
}

#[derive(Debug, Serialize)]
pub struct BundleRow {
    pub id:             String,
    pub name:           String,
    pub description:    Option<String>,
    pub price_cents:    i64,
    pub listing_status: String,
    pub active:         bool,
    pub item_count:     i64,
    pub items:          Vec<BundleItem>,
    pub created_at:     String,
}

// ── GET /enterprise/orgs/:id/bundles ─────────────────────────────────────────

pub async fn list_org_bundles(
    State(state): State<Arc<AppState>>,
    Path(org_id): Path<Uuid>,
) -> impl IntoResponse {
    // Fetch all bundles for org
    let bundles = sqlx::query(
        "SELECT id, name, description, price_cents, listing_status, active, created_at
         FROM listing_bundles WHERE org_id = $1 ORDER BY created_at DESC",
    )
    .bind(org_id)
    .fetch_all(&state.db)
    .await;

    let bundles = match bundles {
        Ok(b) => b,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    // For each bundle, fetch its items with listing name + price
    let mut result: Vec<BundleRow> = Vec::new();

    for b in &bundles {
        let bundle_id: Uuid = b.get("id");

        let items = match sqlx::query(
            "SELECT bi.listing_id, al.name, al.price_cents, bi.display_order
             FROM bundle_items bi
             JOIN agent_listings al ON al.id = bi.listing_id
             WHERE bi.bundle_id = $1
             ORDER BY bi.display_order ASC",
        )
        .bind(bundle_id)
        .fetch_all(&state.db)
        .await
        {
            Ok(i) => i,
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        };

        let bundle_items: Vec<BundleItem> = items
            .iter()
            .map(|r| BundleItem {
                listing_id:    r.get::<Uuid, _>("listing_id").to_string(),
                name:          r.get("name"),
                price_cents:   r.get("price_cents"),
                display_order: r.get("display_order"),
            })
            .collect();

        let item_count = bundle_items.len() as i64;

        result.push(BundleRow {
            id:             bundle_id.to_string(),
            name:           b.get("name"),
            description:    b.get("description"),
            price_cents:    b.get("price_cents"),
            listing_status: b.get("listing_status"),
            active:         b.get("active"),
            item_count,
            items:          bundle_items,
            created_at:     b
                .get::<chrono::DateTime<chrono::Utc>, _>("created_at")
                .to_rfc3339(),
        });
    }

    (StatusCode::OK, Json(serde_json::json!({ "bundles": result }))).into_response()
}

// ── POST /enterprise/orgs/:id/bundles ────────────────────────────────────────

pub async fn create_bundle(
    State(state): State<Arc<AppState>>,
    Path(org_id): Path<Uuid>,
    Json(body): Json<CreateBundleBody>,
) -> impl IntoResponse {
    if body.price_cents <= 0 {
        return (StatusCode::BAD_REQUEST, "price_cents must be > 0").into_response();
    }
    if body.name.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, "name must not be empty").into_response();
    }

    // Validate all listing_ids belong to this org and are APPROVED
    for lid in &body.listing_ids {
        let valid = match sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM agent_listings
             WHERE id = $1 AND org_id = $2 AND listing_status = 'APPROVED'",
        )
        .bind(lid)
        .bind(org_id)
        .fetch_one(&state.db)
        .await
        {
            Ok(v) => v,
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        };

        if valid == 0 {
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                format!("listing {lid} is not an APPROVED listing of this org"),
            )
                .into_response();
        }
    }

    let mut tx = match state.db.begin().await {
        Ok(t) => t,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let bundle_id = Uuid::now_v7();

    let res = sqlx::query(
        "INSERT INTO listing_bundles (id, org_id, name, description, price_cents)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(bundle_id)
    .bind(org_id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(body.price_cents)
    .execute(&mut *tx)
    .await;

    if let Err(e) = res {
        let _ = tx.rollback().await;
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    // Insert bundle_items
    for (order, lid) in body.listing_ids.iter().enumerate() {
        let res = sqlx::query(
            "INSERT INTO bundle_items (id, bundle_id, listing_id, display_order)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(Uuid::now_v7())
        .bind(bundle_id)
        .bind(lid)
        .bind(order as i32)
        .execute(&mut *tx)
        .await;

        if let Err(e) = res {
            let _ = tx.rollback().await;
            return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    }

    if let Err(e) = tx.commit().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    (
        StatusCode::CREATED,
        Json(serde_json::json!({
            "bundle_id":      bundle_id,
            "listing_status": "PENDING_REVIEW"
        })),
    )
        .into_response()
}

// ── PATCH /enterprise/orgs/:id/bundles/:bundle_id ─────────────────────────────

pub async fn update_bundle(
    State(state): State<Arc<AppState>>,
    Path((org_id, bundle_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateBundleBody>,
) -> impl IntoResponse {
    // Load current status (also verifies bundle belongs to org)
    let current = sqlx::query(
        "SELECT listing_status FROM listing_bundles WHERE id = $1 AND org_id = $2",
    )
    .bind(bundle_id)
    .bind(org_id)
    .fetch_optional(&state.db)
    .await;

    let current = match current {
        Ok(Some(r)) => r,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let current_status: String = current.get("listing_status");

    // Determine if listing_ids are changing on an APPROVED bundle → re-moderate
    let items_changed = body.listing_ids.is_some();
    let needs_remoderate = items_changed && current_status == "APPROVED";
    let new_status = if needs_remoderate {
        "PENDING_REVIEW"
    } else {
        &current_status
    };
    let new_active = if needs_remoderate {
        false
    } else {
        current_status == "APPROVED"
    };

    let mut tx = match state.db.begin().await {
        Ok(t) => t,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    // Update scalar fields
    let res = sqlx::query(
        "UPDATE listing_bundles
         SET name           = COALESCE($3, name),
             description    = COALESCE($4, description),
             price_cents    = COALESCE($5, price_cents),
             listing_status = $6,
             active         = $7,
             updated_at     = NOW()
         WHERE id = $1 AND org_id = $2",
    )
    .bind(bundle_id)
    .bind(org_id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(body.price_cents)
    .bind(new_status)
    .bind(new_active)
    .execute(&mut *tx)
    .await;

    if let Err(e) = res {
        let _ = tx.rollback().await;
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    // Replace items if provided
    if let Some(listing_ids) = &body.listing_ids {
        // Validate each listing belongs to org and is APPROVED
        for lid in listing_ids {
            let valid = match sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM agent_listings
                 WHERE id = $1 AND org_id = $2 AND listing_status = 'APPROVED'",
            )
            .bind(lid)
            .bind(org_id)
            .fetch_one(&mut *tx)
            .await
            {
                Ok(v) => v,
                Err(e) => {
                    let _ = tx.rollback().await;
                    return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
                }
            };

            if valid == 0 {
                let _ = tx.rollback().await;
                return (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    format!("listing {lid} is not an APPROVED listing of this org"),
                )
                    .into_response();
            }
        }

        // Delete old items, insert new
        let del = sqlx::query("DELETE FROM bundle_items WHERE bundle_id = $1")
            .bind(bundle_id)
            .execute(&mut *tx)
            .await;
        if let Err(e) = del {
            let _ = tx.rollback().await;
            return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }

        for (order, lid) in listing_ids.iter().enumerate() {
            let ins = sqlx::query(
                "INSERT INTO bundle_items (id, bundle_id, listing_id, display_order)
                 VALUES ($1, $2, $3, $4)",
            )
            .bind(Uuid::now_v7())
            .bind(bundle_id)
            .bind(lid)
            .bind(order as i32)
            .execute(&mut *tx)
            .await;
            if let Err(e) = ins {
                let _ = tx.rollback().await;
                return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
            }
        }
    }

    if let Err(e) = tx.commit().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({ "ok": true, "listing_status": new_status })),
    )
        .into_response()
}

// ── DELETE /enterprise/orgs/:id/bundles/:bundle_id ────────────────────────────

pub async fn delete_bundle(
    State(state): State<Arc<AppState>>,
    Path((org_id, bundle_id)): Path<(Uuid, Uuid)>,
) -> impl IntoResponse {
    let res = sqlx::query("DELETE FROM listing_bundles WHERE id = $1 AND org_id = $2")
        .bind(bundle_id)
        .bind(org_id)
        .execute(&state.db)
        .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => StatusCode::NOT_FOUND.into_response(),
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── Admin: POST /admin/bundles/:id/approve ────────────────────────────────────

pub async fn admin_approve_bundle(
    State(state): State<Arc<AppState>>,
    Path(bundle_id): Path<Uuid>,
) -> impl IntoResponse {
    let res = sqlx::query(BUNDLE_APPROVE_SQL)
        .bind(bundle_id)
        .execute(&state.db)
        .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => StatusCode::NOT_FOUND.into_response(),
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── Admin: POST /admin/bundles/:id/reject ─────────────────────────────────────

pub async fn admin_reject_bundle(
    State(state): State<Arc<AppState>>,
    Path(bundle_id): Path<Uuid>,
    Json(body): Json<RejectBundleBody>,
) -> impl IntoResponse {
    let res = sqlx::query(BUNDLE_REJECT_SQL)
        .bind(bundle_id)
        .bind(&body.reason)
        .execute(&state.db)
        .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => StatusCode::NOT_FOUND.into_response(),
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── Admin: GET /admin/bundles ─────────────────────────────────────────────────

pub async fn admin_list_bundles(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(q): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let status_filter = q.get("status").cloned();
    let rows = sqlx::query(
        "SELECT lb.id, lb.org_id, lb.name, lb.description, lb.price_cents,
                lb.listing_status, lb.active, lb.rejection_reason, lb.created_at,
                COUNT(bi.id) AS item_count
         FROM listing_bundles lb
         LEFT JOIN bundle_items bi ON bi.bundle_id = lb.id
         WHERE ($1::TEXT IS NULL OR lb.listing_status = $1)
         GROUP BY lb.id
         ORDER BY lb.created_at DESC",
    )
    .bind(&status_filter)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rs) => {
            let bundles: Vec<serde_json::Value> = rs
                .iter()
                .map(|r| {
                    serde_json::json!({
                        "id":               r.get::<Uuid, _>("id"),
                        "org_id":           r.get::<Uuid, _>("org_id"),
                        "name":             r.get::<&str, _>("name"),
                        "description":      r.get::<Option<String>, _>("description"),
                        "price_cents":      r.get::<i64, _>("price_cents"),
                        "listing_status":   r.get::<&str, _>("listing_status"),
                        "active":           r.get::<bool, _>("active"),
                        "rejection_reason": r.get::<Option<String>, _>("rejection_reason"),
                        "item_count":       r.get::<i64, _>("item_count"),
                        "created_at":       r.get::<chrono::DateTime<chrono::Utc>, _>("created_at").to_rfc3339(),
                    })
                })
                .collect();
            (StatusCode::OK, Json(serde_json::json!({ "bundles": bundles }))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::{BUNDLE_APPROVE_SQL, BUNDLE_REJECT_SQL};

    #[test]
    fn approve_sets_active_true() {
        assert!(
            BUNDLE_APPROVE_SQL.contains("active = TRUE"),
            "BUNDLE_APPROVE_SQL must set active = TRUE"
        );
        assert!(
            BUNDLE_APPROVE_SQL.contains("listing_status = 'APPROVED'"),
            "BUNDLE_APPROVE_SQL must set listing_status = 'APPROVED'"
        );
    }

    #[test]
    fn reject_sets_active_false() {
        assert!(
            BUNDLE_REJECT_SQL.contains("active = FALSE"),
            "BUNDLE_REJECT_SQL must set active = FALSE"
        );
        assert!(
            BUNDLE_REJECT_SQL.contains("listing_status = 'REJECTED'"),
            "BUNDLE_REJECT_SQL must set listing_status = 'REJECTED'"
        );
        assert!(
            BUNDLE_REJECT_SQL.contains("rejection_reason = $2"),
            "BUNDLE_REJECT_SQL must store rejection_reason"
        );
    }
}
