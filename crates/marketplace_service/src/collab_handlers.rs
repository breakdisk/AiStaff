use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::Arc;
use uuid::Uuid;

use crate::handlers::AppState;

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

pub async fn list_messages(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ListMessagesQuery>,
) -> Result<Json<Vec<MessageRow>>, (StatusCode, String)> {
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
    Json(body): Json<PostMessageBody>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, String)> {
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
