//! Admin-only user management endpoints.
//! All handlers assume the caller is authenticated as admin
//! (enforced by the Next.js middleware + route proxy; these routes are
//!  never exposed externally via Traefik).

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use sqlx::{PgPool, Row as _};
use uuid::Uuid;

// ── GET /admin/users ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct UserListQuery {
    /// Filter by role: "talent" | "client" | "agent-owner" | all
    pub role: Option<String>,
    /// Filter: "suspended" | "active" | all
    pub status: Option<String>,
    /// Filter by account_type: "individual" | "agency"
    pub account_type: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list_users(
    State(pool): State<PgPool>,
    Query(q): Query<UserListQuery>,
) -> impl IntoResponse {
    let limit = q.limit.unwrap_or(50).min(200);
    let offset = q.offset.unwrap_or(0);

    let rows = sqlx::query(
        "SELECT id, display_name, email, identity_tier::TEXT AS identity_tier,
                trust_score, account_type, role, is_admin,
                suspended_at, suspended_reason, created_at
         FROM unified_profiles
         WHERE ($1::TEXT IS NULL OR role = $1)
           AND ($2::TEXT IS NULL OR account_type = $2)
           AND ($3::TEXT IS NULL OR
               CASE $3
                 WHEN 'suspended' THEN suspended_at IS NOT NULL
                 WHEN 'active'    THEN suspended_at IS NULL
                 ELSE TRUE
               END)
         ORDER BY created_at DESC
         LIMIT $4 OFFSET $5",
    )
    .bind(&q.role)
    .bind(&q.account_type)
    .bind(&q.status)
    .bind(limit)
    .bind(offset)
    .fetch_all(&pool)
    .await;

    match rows {
        Ok(rs) => {
            let users: Vec<serde_json::Value> = rs
                .iter()
                .map(|r| {
                    serde_json::json!({
                        "id":               r.get::<Uuid, _>("id"),
                        "display_name":     r.get::<Option<String>, _>("display_name"),
                        "email":            r.get::<String, _>("email"),
                        "identity_tier":    r.get::<&str, _>("identity_tier"),
                        "trust_score":      r.get::<i16, _>("trust_score"),
                        "account_type":     r.get::<String, _>("account_type"),
                        "role":             r.get::<Option<String>, _>("role"),
                        "is_admin":         r.get::<bool, _>("is_admin"),
                        "suspended_at":     r.get::<Option<chrono::DateTime<chrono::Utc>>, _>("suspended_at")
                                             .map(|t| t.to_rfc3339()),
                        "suspended_reason": r.get::<Option<String>, _>("suspended_reason"),
                        "created_at":       r.get::<chrono::DateTime<chrono::Utc>, _>("created_at").to_rfc3339(),
                    })
                })
                .collect();
            (
                StatusCode::OK,
                Json(serde_json::json!({ "users": users, "limit": limit, "offset": offset })),
            )
                .into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── POST /admin/users/:id/suspend ─────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SuspendBody {
    pub reason: String,
}

pub async fn suspend_user(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<SuspendBody>,
) -> impl IntoResponse {
    let res = sqlx::query(
        "UPDATE unified_profiles
         SET suspended_at = NOW(), suspended_reason = $2, updated_at = NOW()
         WHERE id = $1 AND is_admin = FALSE",
    )
    .bind(id)
    .bind(&body.reason)
    .execute(&pool)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => {
            (StatusCode::NOT_FOUND, "user not found or is admin").into_response()
        }
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── POST /admin/users/:id/unsuspend ───────────────────────────────────────────

pub async fn unsuspend_user(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> impl IntoResponse {
    let res = sqlx::query(
        "UPDATE unified_profiles
         SET suspended_at = NULL, suspended_reason = NULL, updated_at = NOW()
         WHERE id = $1",
    )
    .bind(id)
    .execute(&pool)
    .await;

    match res {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── POST /admin/users/:id/set-tier ────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SetTierBody {
    /// "UNVERIFIED" | "SOCIAL_VERIFIED" | "BIOMETRIC_VERIFIED"
    pub tier: String,
}

pub async fn set_user_tier(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<SetTierBody>,
) -> impl IntoResponse {
    let valid = ["UNVERIFIED", "SOCIAL_VERIFIED", "BIOMETRIC_VERIFIED"];
    if !valid.contains(&body.tier.as_str()) {
        return (StatusCode::BAD_REQUEST, "invalid tier").into_response();
    }
    let res = sqlx::query(
        "UPDATE unified_profiles
         SET identity_tier = $2::identity_tier, updated_at = NOW()
         WHERE id = $1",
    )
    .bind(id)
    .bind(&body.tier)
    .execute(&pool)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => StatusCode::NOT_FOUND.into_response(),
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}
