//! Marketplace HTTP handlers — deployment creation, status query.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use common::{
    events::{DeploymentStarted, EventEnvelope, TOPIC_DEPLOYMENT_STARTED},
    kafka::producer::KafkaProducer,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

pub struct AppState {
    pub db: PgPool,
    pub producer: KafkaProducer,
}

pub type SharedState = Arc<AppState>;

// ── POST /deployments ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateDeploymentRequest {
    pub agent_id: Uuid,
    pub client_id: Uuid,
    pub freelancer_id: Uuid,
    /// SHA-256 hex of the agent Wasm artifact — used for drift detection.
    pub agent_artifact_hash: String,
    /// Total escrow in USD cents (developer 70% + talent 30%).
    pub escrow_amount_cents: i64,
}

#[derive(Debug, Serialize)]
pub struct CreateDeploymentResponse {
    pub deployment_id: Uuid,
    pub state: String,
}

pub async fn create_deployment(
    State(state): State<SharedState>,
    Json(req): Json<CreateDeploymentRequest>,
) -> impl IntoResponse {
    // 1. Insert deployment record in PENDING state.
    let deployment_id = Uuid::new_v4();

    let insert = sqlx::query(
        "INSERT INTO deployments
             (id, agent_id, client_id, freelancer_id,
              agent_artifact_hash, escrow_amount_cents, state)
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING'::deployment_status)",
    )
    .bind(deployment_id)
    .bind(req.agent_id)
    .bind(req.client_id)
    .bind(req.freelancer_id)
    .bind(&req.agent_artifact_hash)
    .bind(req.escrow_amount_cents)
    .execute(&state.db)
    .await;

    if let Err(e) = insert {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    // 2. Publish DeploymentStarted → wakes the environment_orchestrator.
    let event = DeploymentStarted {
        deployment_id,
        agent_id: req.agent_id,
        client_id: req.client_id,
        freelancer_id: req.freelancer_id,
    };
    let envelope = EventEnvelope::new("DeploymentStarted", &event);

    if let Err(e) = state
        .producer
        .publish(
            TOPIC_DEPLOYMENT_STARTED,
            &deployment_id.to_string(),
            &envelope,
        )
        .await
    {
        // Kafka unavailable — deployment row is already created, log the gap.
        tracing::error!(
            %deployment_id,
            "DeploymentStarted publish failed (pipeline will not auto-start): {e}"
        );
    }

    tracing::info!(%deployment_id, "deployment created, DeploymentStarted emitted");

    (
        StatusCode::CREATED,
        Json(CreateDeploymentResponse {
            deployment_id,
            state: "PENDING".into(),
        }),
    )
        .into_response()
}

// ── GET /deployments/:id ──────────────────────────────────────────────────────

pub async fn get_deployment(
    State(state): State<SharedState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    use sqlx::Row;

    let row = sqlx::query(
        "SELECT id, agent_id, client_id, freelancer_id,
                agent_artifact_hash, escrow_amount_cents,
                state::TEXT AS state, failure_reason, created_at, updated_at
         FROM deployments WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(r)) => {
            let dep_id: Uuid = r.get("id");
            let agent_id: Uuid = r.get("agent_id");
            let client_id: Uuid = r.get("client_id");
            let freelancer_id: Uuid = r.get("freelancer_id");
            let hash: &str = r.get("agent_artifact_hash");
            let cents: i64 = r.get("escrow_amount_cents");
            let state_str: &str = r.get("state");
            let failure: Option<&str> = r.get("failure_reason");
            let created: chrono::DateTime<chrono::Utc> = r.get("created_at");
            let updated: chrono::DateTime<chrono::Utc> = r.get("updated_at");

            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "id":                   dep_id,
                    "agent_id":             agent_id,
                    "client_id":            client_id,
                    "freelancer_id":        freelancer_id,
                    "agent_artifact_hash":  hash,
                    "escrow_amount_cents":  cents,
                    "state":                state_str,
                    "failure_reason":       failure,
                    "created_at":           created.to_rfc3339(),
                    "updated_at":           updated.to_rfc3339(),
                })),
            )
                .into_response()
        }
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── POST /listings ────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateListingRequest {
    pub developer_id: Uuid,
    pub name: String,
    pub description: String,
    /// SHA-256 hex of the Wasm artifact.
    pub wasm_hash: String,
    /// Price in USD cents.
    pub price_cents: i64,
}

pub async fn create_listing(
    State(state): State<SharedState>,
    Json(req): Json<CreateListingRequest>,
) -> impl IntoResponse {
    let listing_id = Uuid::new_v4();

    let insert = sqlx::query(
        "INSERT INTO agent_listings
             (id, developer_id, name, description, wasm_hash, price_cents)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(listing_id)
    .bind(req.developer_id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(&req.wasm_hash)
    .bind(req.price_cents)
    .execute(&state.db)
    .await;

    match insert {
        Ok(_) => {
            tracing::info!(%listing_id, "agent listing created");
            (
                StatusCode::CREATED,
                Json(serde_json::json!({ "listing_id": listing_id })),
            )
                .into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── GET /listings ─────────────────────────────────────────────────────────────

pub async fn list_listings(State(state): State<SharedState>) -> impl IntoResponse {
    use sqlx::Row;

    let rows = sqlx::query(
        "SELECT id, developer_id, name, description, wasm_hash,
                price_cents, active, created_at, updated_at
         FROM agent_listings
         WHERE active = TRUE
         ORDER BY created_at DESC
         LIMIT 100",
    )
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rs) => {
            let listings: Vec<serde_json::Value> = rs
                .iter()
                .map(|r| {
                    let id: Uuid = r.get("id");
                    let developer_id: Uuid = r.get("developer_id");
                    let name: &str = r.get("name");
                    let description: &str = r.get("description");
                    let wasm_hash: &str = r.get("wasm_hash");
                    let price_cents: i64 = r.get("price_cents");
                    let active: bool = r.get("active");
                    let created: chrono::DateTime<chrono::Utc> = r.get("created_at");
                    let updated: chrono::DateTime<chrono::Utc> = r.get("updated_at");

                    serde_json::json!({
                        "id":           id,
                        "developer_id": developer_id,
                        "name":         name,
                        "description":  description,
                        "wasm_hash":    wasm_hash,
                        "price_cents":  price_cents,
                        "active":       active,
                        "created_at":   created.to_rfc3339(),
                        "updated_at":   updated.to_rfc3339(),
                    })
                })
                .collect();

            (
                StatusCode::OK,
                Json(serde_json::json!({ "listings": listings })),
            )
                .into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── GET /listings/:id ─────────────────────────────────────────────────────────

pub async fn get_listing(
    State(state): State<SharedState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    use sqlx::Row;

    let row = sqlx::query(
        "SELECT id, developer_id, name, description, wasm_hash,
                price_cents, active, created_at, updated_at
         FROM agent_listings WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(r)) => {
            let listing_id: Uuid = r.get("id");
            let developer_id: Uuid = r.get("developer_id");
            let name: &str = r.get("name");
            let description: &str = r.get("description");
            let wasm_hash: &str = r.get("wasm_hash");
            let price_cents: i64 = r.get("price_cents");
            let active: bool = r.get("active");
            let created: chrono::DateTime<chrono::Utc> = r.get("created_at");
            let updated: chrono::DateTime<chrono::Utc> = r.get("updated_at");

            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "id":           listing_id,
                    "developer_id": developer_id,
                    "name":         name,
                    "description":  description,
                    "wasm_hash":    wasm_hash,
                    "price_cents":  price_cents,
                    "active":       active,
                    "created_at":   created.to_rfc3339(),
                    "updated_at":   updated.to_rfc3339(),
                })),
            )
                .into_response()
        }
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── GET /health ───────────────────────────────────────────────────────────────

pub async fn health() -> StatusCode {
    StatusCode::OK
}
