use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct SinceQuery {
    pub since: Option<DateTime<Utc>>,
}

pub async fn get_heartbeats(
    State(db): State<PgPool>,
    Path(deployment_id): Path<Uuid>,
    Query(q): Query<SinceQuery>,
) -> impl IntoResponse {
    let since = q.since.unwrap_or_else(|| Utc::now() - chrono::Duration::hours(1));

    let rows = sqlx::query!(
        "SELECT cpu_pct, mem_bytes, artifact_hash, recorded_at
         FROM telemetry_heartbeats
         WHERE deployment_id = $1 AND recorded_at >= $2
         ORDER BY recorded_at ASC",
        deployment_id,
        since,
    )
    .fetch_all(&db)
    .await;

    match rows {
        Ok(rows) => {
            let data: Vec<_> = rows
                .iter()
                .map(|r| serde_json::json!({
                    "cpu_pct":      r.cpu_pct,
                    "mem_bytes":    r.mem_bytes,
                    "artifact_hash": r.artifact_hash,
                    "recorded_at":  r.recorded_at.to_rfc3339(),
                }))
                .collect();
            (StatusCode::OK, Json(data)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn get_drift_events(
    State(db): State<PgPool>,
    Path(deployment_id): Path<Uuid>,
) -> impl IntoResponse {
    let rows = sqlx::query!(
        "SELECT id, expected_hash, actual_hash, detected_at
         FROM drift_events WHERE deployment_id = $1 ORDER BY detected_at DESC",
        deployment_id
    )
    .fetch_all(&db)
    .await;

    match rows {
        Ok(rows) => {
            let data: Vec<_> = rows
                .iter()
                .map(|r| serde_json::json!({
                    "id":            r.id,
                    "expected_hash": r.expected_hash,
                    "actual_hash":   r.actual_hash,
                    "detected_at":   r.detected_at.to_rfc3339(),
                }))
                .collect();
            (StatusCode::OK, Json(data)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn health() -> StatusCode {
    StatusCode::OK
}
