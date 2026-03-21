// crates/marketplace_service/src/enterprise_handlers.rs
// IMPORTANT: marketplace_service uses Arc<AppState> — use &state.db for all queries
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Serialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::handlers::AppState;

#[derive(Serialize)]
pub struct OrgDeploymentRow {
    pub id: String,
    pub listing_title: Option<String>,
    pub deployment_type: String,
    pub status: String,
    pub escrow_amount_cents: i64,
    pub created_at: String,
    pub org_id: String,
}

#[derive(Serialize)]
pub struct OrgAnalytics {
    pub org_id: String,
    pub total_deployments: i64,
    pub active_deployments: i64,
    pub total_spend_cents: i64,
    pub avg_dod_pass_rate: f64,
    pub drift_incidents_30d: i64,
}

/// GET /enterprise/orgs/:id/deployments
pub async fn list_org_deployments(
    State(state): State<Arc<AppState>>,
    Path(org_id): Path<Uuid>,
) -> Result<Json<Vec<OrgDeploymentRow>>, StatusCode> {
    // Column is `state` (deployment_status enum), aliased as `status`
    let rows: Vec<(Uuid, Option<String>, String, String, i64, chrono::DateTime<chrono::Utc>, Uuid)> =
        sqlx::query_as(
            "SELECT d.id, al.title, d.deployment_type::TEXT,
                    d.state::TEXT AS status, d.escrow_amount_cents, d.created_at, d.org_id
             FROM deployments d
             LEFT JOIN agent_listings al ON al.id = d.listing_id
             WHERE d.org_id = $1
             ORDER BY d.created_at DESC
             LIMIT 100",
        )
        .bind(org_id)
        .fetch_all(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let deployments = rows
        .into_iter()
        .map(
            |(id, title, dtype, status, escrow, created, oid)| OrgDeploymentRow {
                id: id.to_string(),
                listing_title: title,
                deployment_type: dtype,
                status,
                escrow_amount_cents: escrow,
                created_at: created.to_rfc3339(),
                org_id: oid.to_string(),
            },
        )
        .collect();

    Ok(Json(deployments))
}

/// GET /enterprise/orgs/:id/analytics
///
/// Uses individual query_scalar calls to avoid multi-column tuple type
/// inference issues with sqlx. Each scalar maps to a single unambiguous
/// PostgreSQL return type.
pub async fn org_analytics(
    State(state): State<Arc<AppState>>,
    Path(org_id): Path<Uuid>,
) -> Result<Json<OrgAnalytics>, StatusCode> {
    macro_rules! scalar {
        ($label:expr, $sql:expr) => {
            sqlx::query_scalar($sql)
                .bind(org_id)
                .fetch_one(&state.db)
                .await
                .map_err(|e| {
                    tracing::error!(%org_id, "{} failed: {e:#}", $label);
                    StatusCode::INTERNAL_SERVER_ERROR
                })?
        };
    }

    // ── Deployment counts ──────────────────────────────────────────────────
    let total: i64 = scalar!(
        "total_deployments",
        "SELECT COUNT(*) FROM deployments WHERE org_id = $1"
    );

    let active: i64 = scalar!(
        "active_deployments",
        "SELECT COUNT(*)
         FROM deployments
         WHERE org_id = $1
           AND state::TEXT NOT IN ('VETOED','RELEASED','FAILED')"
    );

    // SUM(bigint) returns NUMERIC in PostgreSQL — cast explicitly to bigint.
    let spend: i64 = scalar!(
        "total_spend",
        "SELECT COALESCE(SUM(escrow_amount_cents)::BIGINT, 0)
         FROM deployments
         WHERE org_id = $1"
    );

    // ── DoD pass rate ──────────────────────────────────────────────────────
    let dod_total: i64 = scalar!(
        "dod_total_steps",
        "SELECT COUNT(*)
         FROM dod_checklist_steps dcs
         JOIN deployments d ON d.id = dcs.deployment_id
         WHERE d.org_id = $1"
    );

    let dod_passed: i64 = scalar!(
        "dod_passed_steps",
        "SELECT COUNT(*)
         FROM dod_checklist_steps dcs
         JOIN deployments d ON d.id = dcs.deployment_id
         WHERE d.org_id = $1
           AND dcs.passed = TRUE"
    );

    let avg_pass = if dod_total > 0 {
        (dod_passed as f64 / dod_total as f64) * 100.0
    } else {
        0.0
    };

    // ── Drift incidents ────────────────────────────────────────────────────
    let drift: i64 = scalar!(
        "drift_incidents",
        "SELECT COUNT(*)
         FROM drift_events de
         JOIN deployments d ON d.id = de.deployment_id
         WHERE d.org_id = $1
           AND de.detected_at > NOW() - INTERVAL '30 days'"
    );

    Ok(Json(OrgAnalytics {
        org_id: org_id.to_string(),
        total_deployments: total,
        active_deployments: active,
        total_spend_cents: spend,
        avg_dod_pass_rate: (avg_pass * 10.0).round() / 10.0,
        drift_incidents_30d: drift,
    }))
}
