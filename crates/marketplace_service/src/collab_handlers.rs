use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use common::events::{EventEnvelope, MessageSent, TOPIC_MESSAGE_SENT};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::Arc;
use uuid::Uuid;

use crate::handlers::AppState;

// ── Access helpers ────────────────────────────────────────────────────────────

fn extract_profile_id(headers: &HeaderMap) -> Result<Uuid, (StatusCode, String)> {
    let val = headers
        .get("x-profile-id")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "Missing X-Profile-Id header".to_string()))?;
    Uuid::parse_str(val)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid X-Profile-Id".to_string()))
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
        return Err((StatusCode::FORBIDDEN, "Not a participant of this deployment".to_string()));
    }
    Ok(())
}

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ListMessagesQuery {
    pub deployment_id: Uuid,
}

#[derive(Deserialize)]
pub struct UnreadQuery {
    pub profile_id: Uuid,
}

#[derive(Deserialize)]
pub struct MarkReadBody {
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

    if body.sender_id != profile_id {
        return Err((StatusCode::FORBIDDEN, "sender_id does not match authenticated profile".to_string()));
    }

    check_deployment_access(&state.db, body.deployment_id, profile_id).await?;

    // Insert message and capture generated id
    let msg_row = sqlx::query(
        "INSERT INTO collab_messages (deployment_id, sender_id, sender_name, body, file_name)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id",
    )
    .bind(body.deployment_id)
    .bind(body.sender_id)
    .bind(&body.sender_name)
    .bind(&body.body)
    .bind(&body.file_name)
    .fetch_one(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let message_id: Uuid = msg_row
        .try_get("id")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Fetch deployment participants to build recipient list
    let dep_row = sqlx::query(
        "SELECT client_id, freelancer_id, developer_id FROM deployments WHERE id = $1",
    )
    .bind(body.deployment_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Some(dep) = dep_row {
        let client_id:     Uuid = dep.try_get("client_id")    .unwrap_or(profile_id);
        let freelancer_id: Uuid = dep.try_get("freelancer_id").unwrap_or(profile_id);
        let developer_id:  Uuid = dep.try_get("developer_id") .unwrap_or(profile_id);

        // Recipients = all participants except the sender
        let recipient_ids: Vec<Uuid> = [client_id, freelancer_id, developer_id]
            .into_iter()
            .filter(|&id| id != body.sender_id)
            .collect::<std::collections::HashSet<Uuid>>()
            .into_iter()
            .collect();

        if !recipient_ids.is_empty() {
            let preview: String = body.body.chars().take(120).collect();
            let event = MessageSent {
                deployment_id: body.deployment_id,
                message_id,
                sender_id:    body.sender_id,
                sender_name:  body.sender_name.clone(),
                recipient_ids,
                body_preview: preview,
            };
            let envelope = EventEnvelope::new("MessageSent", &event);
            // Non-fatal: if Kafka is down, message is still saved
            if let Err(e) = state
                .producer
                .publish(TOPIC_MESSAGE_SENT, &body.deployment_id.to_string(), &envelope)
                .await
            {
                tracing::warn!(error=%e, "Failed to emit MessageSent — message saved, notification skipped");
            }
        }
    }

    Ok((StatusCode::CREATED, Json(serde_json::json!({ "ok": true, "id": message_id }))))
}

/// POST /collab/read — upsert read horizon for caller in a deployment
pub async fn mark_read(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<MarkReadBody>,
) -> Result<StatusCode, (StatusCode, String)> {
    let profile_id = extract_profile_id(&headers)?;
    check_deployment_access(&state.db, body.deployment_id, profile_id).await?;

    sqlx::query(
        "INSERT INTO collab_read_horizons (deployment_id, profile_id, last_read_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (deployment_id, profile_id)
         DO UPDATE SET last_read_at = NOW()",
    )
    .bind(body.deployment_id)
    .bind(profile_id)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /collab/unread?profile_id=<uuid>
/// Returns total unread message count across all of the caller's deployments.
pub async fn unread_count(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<UnreadQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let profile_id = extract_profile_id(&headers)?;

    // Verify caller is only querying their own count
    if params.profile_id != profile_id {
        return Err((StatusCode::FORBIDDEN, "Cannot query unread for another profile".to_string()));
    }

    let row = sqlx::query(
        "SELECT COUNT(*) AS cnt
         FROM collab_messages m
         JOIN deployments d ON d.id = m.deployment_id
         LEFT JOIN collab_read_horizons h
               ON h.deployment_id = m.deployment_id
              AND h.profile_id    = $1
         WHERE (d.client_id = $1 OR d.freelancer_id = $1 OR d.developer_id = $1)
           AND m.sender_id != $1
           AND m.created_at > COALESCE(h.last_read_at, '1970-01-01'::timestamptz)",
    )
    .bind(profile_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let cnt: i64 = row
        .try_get("cnt")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "unread": cnt })))
}
