use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::Arc;
use uuid::Uuid;

use crate::handlers::AppState;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ListIntegrationsQuery {
    pub deployment_id: Uuid,
}

#[derive(Deserialize)]
pub struct ByExternalIdQuery {
    pub external_id: String,
}

#[derive(Serialize)]
pub struct IntegrationEvent {
    pub id:          Uuid,
    pub event_type:  String,
    pub title:       String,
    pub occurred_at: String,
}

#[derive(Serialize)]
pub struct IntegrationRow {
    pub id:            Uuid,
    pub deployment_id: Uuid,
    pub provider:      String,
    pub name:          String,
    pub external_url:  String,
    pub external_id:   String,
    pub status:        String,
    pub connected_at:  String,
    pub events:        Vec<IntegrationEvent>,
}

#[derive(Deserialize)]
pub struct CreateIntegrationBody {
    pub deployment_id: Uuid,
    pub provider:      String,
    pub name:          String,
    pub external_url:  String,
    pub external_id:   String,
    pub webhook_id:    Option<i64>,
    pub connected_by:  Uuid,
}

#[derive(Deserialize)]
pub struct CreateEventBody {
    pub integration_id: Uuid,
    pub event_type:     String,
    pub title:          String,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/// Extract the authenticated profile ID from the `X-Profile-Id` header.
fn extract_profile_id(headers: &HeaderMap) -> Result<Uuid, (StatusCode, String)> {
    let val = headers
        .get("x-profile-id")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "Missing X-Profile-Id header".to_string()))?;
    Uuid::parse_str(val)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid X-Profile-Id".to_string()))
}

/// Verify the profile is a participant of the deployment.
async fn check_deployment_access(
    db: &sqlx::PgPool,
    deployment_id: Uuid,
    profile_id: Uuid,
) -> Result<(), (StatusCode, String)> {
    let row = sqlx::query(
        "SELECT EXISTS(
            SELECT 1 FROM deployments
            WHERE id = $1
              AND (client_id = $2 OR freelancer_id = $2 OR developer_id = $2)
         ) AS ok",
    )
    .bind(deployment_id)
    .bind(profile_id)
    .fetch_one(db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let ok: bool = row.try_get("ok").unwrap_or(false);
    if !ok {
        return Err((StatusCode::FORBIDDEN, "Not a participant of this deployment".to_string()));
    }
    Ok(())
}

/// GET /integrations?deployment_id=<uuid>
/// Returns all integrations for a deployment with their last 3 events each.
/// Caller must be a participant of the deployment (enforced via X-Profile-Id header).
pub async fn list_integrations(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<ListIntegrationsQuery>,
) -> Result<Json<Vec<IntegrationRow>>, (StatusCode, String)> {
    let profile_id = extract_profile_id(&headers)?;
    check_deployment_access(&state.db, params.deployment_id, profile_id).await?;
    let rows = sqlx::query(
        "SELECT id, deployment_id, provider, name, external_url, external_id, status,
                to_char(connected_at, 'Mon DD HH24:MI') AS connected_at_fmt
         FROM workspace_integrations
         WHERE deployment_id = $1
         ORDER BY connected_at ASC",
    )
    .bind(params.deployment_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut integrations = Vec::new();

    for row in &rows {
        let id: Uuid = row
            .try_get("id")
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        let event_rows = sqlx::query(
            "SELECT id, event_type, title,
                    to_char(occurred_at, 'YYYY-MM-DD HH24:MI') AS occurred_at_fmt
             FROM workspace_integration_events
             WHERE integration_id = $1
             ORDER BY occurred_at DESC
             LIMIT 3",
        )
        .bind(id)
        .fetch_all(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        let events = event_rows
            .iter()
            .map(|er| {
                Ok(IntegrationEvent {
                    id:          er.try_get::<Uuid, _>("id")?,
                    event_type:  er.try_get::<String, _>("event_type")?,
                    title:       er.try_get::<String, _>("title")?,
                    occurred_at: er.try_get::<String, _>("occurred_at_fmt")?,
                })
            })
            .collect::<Result<Vec<_>, sqlx::Error>>()
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        integrations.push(IntegrationRow {
            id,
            deployment_id: row
                .try_get("deployment_id")
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?,
            provider: row
                .try_get("provider")
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?,
            name: row
                .try_get("name")
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?,
            external_url: row
                .try_get("external_url")
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?,
            external_id: row
                .try_get("external_id")
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?,
            status: row
                .try_get("status")
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?,
            connected_at: row
                .try_get("connected_at_fmt")
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?,
            events,
        });
    }

    Ok(Json(integrations))
}

/// POST /integrations
/// Saves a new integration record (called after webhook is registered externally).
pub async fn create_integration(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateIntegrationBody>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, String)> {
    let id = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO workspace_integrations
            (id, deployment_id, provider, name, external_url, external_id, webhook_id, connected_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(id)
    .bind(body.deployment_id)
    .bind(&body.provider)
    .bind(&body.name)
    .bind(&body.external_url)
    .bind(&body.external_id)
    .bind(body.webhook_id)
    .bind(body.connected_by)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({ "id": id.to_string() }))))
}

/// POST /integrations/events
/// Stores a single event received from an external webhook (GitHub, etc.).
pub async fn create_event(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateEventBody>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, String)> {
    let id = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO workspace_integration_events (id, integration_id, event_type, title)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(id)
    .bind(body.integration_id)
    .bind(&body.event_type)
    .bind(&body.title)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({ "id": id.to_string() }))))
}

/// GET /integrations/by-external-id?external_id=<string>
/// Looks up an integration by its external identifier (e.g. GitHub repo full_name).
/// Used by the webhook receiver to route incoming events.
pub async fn get_by_external_id(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ByExternalIdQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let row = sqlx::query(
        "SELECT id FROM workspace_integrations WHERE external_id = $1 LIMIT 1",
    )
    .bind(&params.external_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    match row {
        Some(r) => {
            let id: Uuid = r
                .try_get("id")
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            Ok(Json(serde_json::json!({ "id": id.to_string() })))
        }
        None => Err((StatusCode::NOT_FOUND, "Integration not found".to_string())),
    }
}
