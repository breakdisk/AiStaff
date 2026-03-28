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

/// `deployment_id` is optional — integrations can be workspace-level
/// (no deployment) or scoped to a specific deployment.
#[derive(Deserialize)]
#[allow(dead_code)]
pub struct ListIntegrationsQuery {
    pub deployment_id: Option<Uuid>,
    pub profile_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct ByExternalIdQuery {
    pub external_id: String,
}

#[derive(Serialize)]
pub struct IntegrationEvent {
    pub id: Uuid,
    pub event_type: String,
    pub title: String,
    pub occurred_at: String,
}

#[derive(Serialize)]
pub struct IntegrationRow {
    pub id: Uuid,
    pub deployment_id: Option<Uuid>,
    pub provider: String,
    pub name: String,
    pub external_url: String,
    pub external_id: String,
    pub status: String,
    pub connected_at: String,
    pub events: Vec<IntegrationEvent>,
}

#[derive(Deserialize)]
pub struct CreateIntegrationBody {
    pub deployment_id: Option<Uuid>,
    pub owner_profile_id: Option<Uuid>,
    pub provider: String,
    pub name: String,
    pub external_url: String,
    pub external_id: String,
    pub webhook_id: Option<i64>,
    pub connected_by: Uuid,
}

#[derive(Deserialize)]
pub struct CreateEventBody {
    pub integration_id: Uuid,
    pub event_type: String,
    pub title: String,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn extract_profile_id(headers: &HeaderMap) -> Result<Uuid, (StatusCode, String)> {
    let val = headers
        .get("x-profile-id")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                "Missing X-Profile-Id header".to_string(),
            )
        })?;
    Uuid::parse_str(val).map_err(|_| (StatusCode::BAD_REQUEST, "Invalid X-Profile-Id".to_string()))
}

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
        return Err((
            StatusCode::FORBIDDEN,
            "Not a participant of this deployment".to_string(),
        ));
    }
    Ok(())
}

async fn fetch_events(
    db: &sqlx::PgPool,
    integration_id: Uuid,
) -> Result<Vec<IntegrationEvent>, (StatusCode, String)> {
    let rows = sqlx::query(
        "SELECT id, event_type, title,
                to_char(occurred_at, 'YYYY-MM-DD HH24:MI') AS occurred_at_fmt
         FROM workspace_integration_events
         WHERE integration_id = $1
         ORDER BY occurred_at DESC
         LIMIT 3",
    )
    .bind(integration_id)
    .fetch_all(db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    rows.iter()
        .map(|er| {
            Ok(IntegrationEvent {
                id: er.try_get::<Uuid, _>("id")?,
                event_type: er.try_get::<String, _>("event_type")?,
                title: er.try_get::<String, _>("title")?,
                occurred_at: er.try_get::<String, _>("occurred_at_fmt")?,
            })
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/// GET /integrations?deployment_id=<uuid>  — scoped to a deployment
/// GET /integrations?profile_id=<uuid>     — all workspace integrations for a user
pub async fn list_integrations(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<ListIntegrationsQuery>,
) -> Result<Json<Vec<IntegrationRow>>, (StatusCode, String)> {
    let profile_id = extract_profile_id(&headers)?;

    // If scoped to a deployment, verify participation
    if let Some(dep_id) = params.deployment_id {
        check_deployment_access(&state.db, dep_id, profile_id).await?;
    }

    let rows = if let Some(dep_id) = params.deployment_id {
        sqlx::query(
            "SELECT id, deployment_id, provider, name, external_url, external_id, status,
                    to_char(connected_at, 'Mon DD HH24:MI') AS connected_at_fmt
             FROM workspace_integrations
             WHERE deployment_id = $1
             ORDER BY connected_at ASC",
        )
        .bind(dep_id)
        .fetch_all(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    } else {
        // Workspace-level: all integrations owned by this profile
        sqlx::query(
            "SELECT id, deployment_id, provider, name, external_url, external_id, status,
                    to_char(connected_at, 'Mon DD HH24:MI') AS connected_at_fmt
             FROM workspace_integrations
             WHERE owner_profile_id = $1
             ORDER BY connected_at ASC",
        )
        .bind(profile_id)
        .fetch_all(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    };

    let mut integrations = Vec::new();
    for row in &rows {
        let id: Uuid = row
            .try_get("id")
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        let events = fetch_events(&state.db, id).await?;

        integrations.push(IntegrationRow {
            id,
            deployment_id: row.try_get("deployment_id").ok(),
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

/// POST /integrations — deployment_id now optional
pub async fn create_integration(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateIntegrationBody>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, String)> {
    let id = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO workspace_integrations
            (id, deployment_id, owner_profile_id, provider, name, external_url, external_id, webhook_id, connected_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    )
    .bind(id)
    .bind(body.deployment_id)
    .bind(body.owner_profile_id)
    .bind(&body.provider)
    .bind(&body.name)
    .bind(&body.external_url)
    .bind(&body.external_id)
    .bind(body.webhook_id)
    .bind(body.connected_by)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "id": id.to_string() })),
    ))
}

/// POST /integrations/events
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

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "id": id.to_string() })),
    ))
}

/// GET /integrations/by-external-id?external_id=<string>
pub async fn get_by_external_id(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ByExternalIdQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let row = sqlx::query(
        "SELECT id, connected_by, owner_profile_id FROM workspace_integrations WHERE external_id = $1 LIMIT 1",
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
            let connected_by: Uuid = r
                .try_get("connected_by")
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            let owner_profile_id: Option<Uuid> = r.try_get("owner_profile_id").ok();
            Ok(Json(serde_json::json!({
                "id": id.to_string(),
                "connected_by": connected_by.to_string(),
                "owner_profile_id": owner_profile_id.map(|u| u.to_string()),
            })))
        }
        None => Err((StatusCode::NOT_FOUND, "Integration not found".to_string())),
    }
}
