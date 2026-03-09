use crate::checklist::ChecklistService;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

pub type AppState = Arc<ChecklistService>;

#[derive(Deserialize)]
pub struct StepRequest {
    pub step_id:    String,
    pub step_label: String,
    pub passed:     bool,
    pub notes:      Option<String>,
}

#[derive(Serialize)]
pub struct StepResponse {
    pub recorded: bool,
}

pub async fn record_step(
    State(svc): State<AppState>,
    Path(deployment_id): Path<Uuid>,
    Json(req): Json<StepRequest>,
) -> impl IntoResponse {
    match svc
        .record_step(deployment_id, req.step_id, req.step_label, req.passed, req.notes)
        .await
    {
        Ok(_) => (StatusCode::OK, Json(StepResponse { recorded: true })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn get_summary(
    State(svc): State<AppState>,
    Path(deployment_id): Path<Uuid>,
) -> impl IntoResponse {
    let row = sqlx::query!(
        "SELECT all_passed, failed_steps, finalized_at
         FROM dod_checklist_summaries WHERE deployment_id = $1",
        deployment_id
    )
    .fetch_optional(&svc.db)
    .await;

    match row {
        Ok(Some(r)) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "deployment_id": deployment_id,
                "all_passed":    r.all_passed,
                "failed_steps":  r.failed_steps,
                "finalized_at":  r.finalized_at.to_rfc3339(),
            })),
        )
            .into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn get_steps(
    State(svc): State<AppState>,
    Path(deployment_id): Path<Uuid>,
) -> impl IntoResponse {
    let rows = sqlx::query(
        "SELECT step_id, step_label, passed, notes
         FROM dod_checklist_steps
         WHERE deployment_id = $1
         ORDER BY completed_at ASC",
    )
    .bind(deployment_id)
    .fetch_all(&svc.db)
    .await;

    match rows {
        Ok(rows) => {
            let data: Vec<_> = rows
                .iter()
                .map(|r| {
                    use sqlx::Row;
                    serde_json::json!({
                        "step_id":    r.try_get::<String, _>("step_id").unwrap_or_default(),
                        "step_label": r.try_get::<String, _>("step_label").unwrap_or_default(),
                        "passed":     r.try_get::<bool, _>("passed").unwrap_or(false),
                        "notes":      r.try_get::<Option<String>, _>("notes").unwrap_or(None),
                    })
                })
                .collect();
            (StatusCode::OK, Json(data)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn health() -> StatusCode {
    StatusCode::OK
}
