use crate::issuer::LicenseIssuer;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

pub type AppState = Arc<LicenseIssuer>;

#[derive(Deserialize)]
pub struct IssueRequest {
    pub agent_id: Uuid,
    pub licensee_id: Uuid,
    pub jurisdiction: String,
    pub seats: u32,
    pub duration_days: u32,
    pub transaction_id: Uuid,
}

#[derive(Serialize)]
pub struct IssueResponse {
    pub license_id: Uuid,
}

pub async fn issue_license(
    State(svc): State<AppState>,
    Json(req): Json<IssueRequest>,
) -> impl IntoResponse {
    let expires_at = Utc::now() + Duration::days(req.duration_days as i64);
    match svc
        .issue(
            req.agent_id,
            req.licensee_id,
            req.jurisdiction,
            req.seats,
            expires_at,
            req.transaction_id,
        )
        .await
    {
        Ok(id) => (StatusCode::OK, Json(IssueResponse { license_id: id })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[derive(Serialize)]
pub struct LicenseStatus {
    pub id: Uuid,
    pub jurisdiction: String,
    pub seats: i32,
    pub expires_at: String,
    pub revoked: bool,
}

pub async fn get_license(State(svc): State<AppState>, Path(id): Path<Uuid>) -> impl IntoResponse {
    let row = sqlx::query!(
        "SELECT id, jurisdiction, seats, expires_at, revoked_at
         FROM licenses WHERE id = $1",
        id
    )
    .fetch_optional(&svc.db)
    .await;

    match row {
        Ok(Some(r)) => (
            StatusCode::OK,
            Json(LicenseStatus {
                id: r.id,
                jurisdiction: r.jurisdiction,
                seats: r.seats,
                expires_at: r.expires_at.to_rfc3339(),
                revoked: r.revoked_at.is_some(),
            }),
        )
            .into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[derive(Deserialize)]
pub struct RevokeRequest {
    pub reason: String,
}

pub async fn revoke_license(
    State(svc): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<RevokeRequest>,
) -> impl IntoResponse {
    match svc.revoke(id, &req.reason).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::UNPROCESSABLE_ENTITY, e.to_string()).into_response(),
    }
}

#[derive(Deserialize)]
pub struct ValidateQuery {
    pub jurisdiction: String,
}

pub async fn validate_license(
    State(svc): State<AppState>,
    Path(id): Path<Uuid>,
    Query(q): Query<ValidateQuery>,
) -> impl IntoResponse {
    match crate::validator::validate(&svc.db, id, &q.jurisdiction).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::UNPROCESSABLE_ENTITY, e.to_string()).into_response(),
    }
}

pub async fn health() -> StatusCode {
    StatusCode::OK
}
