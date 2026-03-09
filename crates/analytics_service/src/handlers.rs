use crate::roi;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct LeaderboardQuery {
    pub limit: Option<i64>,
}

pub async fn talent_roi(
    State(db): State<PgPool>,
    Path(talent_id): Path<Uuid>,
) -> impl IntoResponse {
    match roi::talent_roi(&db, talent_id).await {
        Ok(report) => (StatusCode::OK, Json(report)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn leaderboard(
    State(db): State<PgPool>,
    Query(q): Query<LeaderboardQuery>,
) -> impl IntoResponse {
    let limit = q.limit.unwrap_or(50).min(200);
    match roi::leaderboard(&db, limit).await {
        Ok(reports) => (StatusCode::OK, Json(reports)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn health() -> StatusCode {
    StatusCode::OK
}
