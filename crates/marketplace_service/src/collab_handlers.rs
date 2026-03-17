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

// ── Shared access helpers ─────────────────────────────────────────────────────

/// Extract the authenticated profile ID from the `X-Profile-Id` header.
/// This header is set by the Next.js proxy after verifying the session.
fn extract_profile_id(headers: &HeaderMap) -> Result<Uuid, (StatusCode, String)> {
    let val = headers
        .get("x-profile-id")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "Missing X-Profile-Id header".to_string()))?;
    Uuid::parse_str(val)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid X-Profile-Id".to_string()))
}

/// Verify the profile is a participant (client, freelancer, or developer) of the deployment.
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

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ListMessagesQuery {
    pub deployment_id: Uuid,
}

#[derive(Serialize)]
pub struct MessageRow {
    pub id:            Uuid,
    pub deployment_id: Uuid,
    pub sender_id:     Uuid,
    pub sender_name:   String,
    pub body:          String,
    pub file_name:     Option<String>,
    pub ts:            String,
}

#[derive(Deserialize)]
pub struct PostMessageBody {
    pub deployment_id: Uuid,
    pub sender_id:     Uuid,
    pub sender_name:   String,
    pub body:          String,
    pub file_name:     Option<String>,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

pub async fn list_messages(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<ListMessagesQuery>,
) -> Result<Json<Vec<MessageRow>>, (StatusCode, String)> {
    let profile_id = extract_profile_id(&headers)?;
    check_deployment_access(&state.db, params.deployment_id, profile_id).await?;

    let rows = sqlx::query(
        "SELECT id, deployment_id, sender_id, sender_name, body, file_name,
                to_char(created_at, 'Mon DD HH24:MI') AS ts
         FROM collab_messages
         WHERE deployment_id = $1
         ORDER BY created_at ASC
         LIMIT 200",
    )
    .bind(params.deployment_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let messages = rows
        .iter()
        .map(|row| {
            Ok(MessageRow {
                id:            row.try_get::<Uuid, _>("id")?,
                deployment_id: row.try_get::<Uuid, _>("deployment_id")?,
                sender_id:     row.try_get::<Uuid, _>("sender_id")?,
                sender_name:   row.try_get::<String, _>("sender_name")?,
                body:          row.try_get::<String, _>("body")?,
                file_name:     row.try_get::<Option<String>, _>("file_name")?,
                ts:            row.try_get::<String, _>("ts")?,
            })
        })
        .collect::<Result<Vec<MessageRow>, sqlx::Error>>()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(messages))
}

pub async fn post_message(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<PostMessageBody>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, String)> {
    let profile_id = extract_profile_id(&headers)?;

    // sender_id in the body must match the authenticated caller
    if body.sender_id != profile_id {
        return Err((StatusCode::FORBIDDEN, "sender_id does not match authenticated profile".to_string()));
    }

    check_deployment_access(&state.db, body.deployment_id, profile_id).await?;

    sqlx::query(
        "INSERT INTO collab_messages (deployment_id, sender_id, sender_name, body, file_name)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(body.deployment_id)
    .bind(body.sender_id)
    .bind(&body.sender_name)
    .bind(&body.body)
    .bind(&body.file_name)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({ "ok": true }))))
}
