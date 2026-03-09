//! REST handlers — bridge between the UI and the Kafka-driven veto/payout flow.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use common::events::{EventEnvelope, PayoutVeto, TOPIC_PAYOUT_VETO};
use common::kafka::producer::KafkaProducer;
use serde::Deserialize;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

pub struct AppState {
    pub db:       PgPool,
    pub producer: KafkaProducer,
}

#[derive(Deserialize)]
pub struct VetoBody {
    pub talent_id: Uuid,
    pub reason:    Option<String>,
}

#[derive(Deserialize)]
pub struct ApproveBody {
    #[allow(dead_code)] // reserved for biometric audit log in v2
    pub talent_id: Uuid,
}

/// Publishes a `PayoutVeto` event so the Kafka consumer cancels the payout.
pub async fn veto(
    State(state): State<Arc<AppState>>,
    Path(deployment_id): Path<Uuid>,
    Json(body): Json<VetoBody>,
) -> impl IntoResponse {
    let event = PayoutVeto {
        deployment_id,
        talent_id: body.talent_id,
        reason:    body.reason.unwrap_or_else(|| "Operator veto".into()),
    };
    let env = EventEnvelope::new("PayoutVeto", &event);

    if let Err(e) = state
        .producer
        .publish(TOPIC_PAYOUT_VETO, &deployment_id.to_string(), &env)
        .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    (StatusCode::OK, Json(serde_json::json!({"ok": true}))).into_response()
}

/// Early approval — skips the remaining veto window and advances to BIOMETRIC_PENDING.
/// The operator has explicitly reviewed the deployment and waives their veto right.
pub async fn approve(
    State(state): State<Arc<AppState>>,
    Path(deployment_id): Path<Uuid>,
    Json(_body): Json<ApproveBody>,
) -> impl IntoResponse {
    let res = sqlx::query(
        "UPDATE deployments
         SET state = 'BIOMETRIC_PENDING'::deployment_status, updated_at = NOW()
         WHERE id = $1 AND state = 'VETO_WINDOW'::deployment_status",
    )
    .bind(deployment_id)
    .execute(&state.db)
    .await;

    match res {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({"ok": true}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn health() -> StatusCode {
    StatusCode::OK
}
