use axum::{
    extract::{Path, Query, State},
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

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ListMessagesQuery {
    pub deployment_id: Uuid,
    pub after: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Deserialize)]
pub struct UnreadQuery {
    pub profile_id: Uuid,
}

#[derive(Deserialize)]
pub struct MarkReadBody {
    pub deployment_id: Uuid,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ReactionGroup {
    pub emoji: String,
    pub count: i64,
    pub profile_ids: Vec<Uuid>,
}

#[derive(Serialize)]
pub struct MessageRow {
    pub id: Uuid,
    pub deployment_id: Uuid,
    pub sender_id: Uuid,
    pub sender_name: String,
    pub body: String,
    pub file_name: Option<String>,
    pub file_path: Option<String>,
    pub ts: String,
    pub edited_at: Option<String>,
    pub deleted_at: Option<String>,
    pub parent_msg_id: Option<Uuid>,
    pub reply_count: i64,
    pub reactions: Vec<ReactionGroup>,
}

#[derive(Deserialize)]
pub struct PostMessageBody {
    pub deployment_id: Uuid,
    pub sender_id: Uuid,
    pub sender_name: String,
    pub body: String,
    pub file_name: Option<String>,
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
        "SELECT
             m.id, m.deployment_id, m.sender_id, m.sender_name,
             CASE WHEN m.deleted_at IS NOT NULL THEN '[deleted]' ELSE m.body END AS body,
             m.file_name,
             CASE WHEN m.deleted_at IS NOT NULL THEN NULL ELSE m.file_path END AS file_path,
             to_char(m.created_at AT TIME ZONE 'UTC', 'Mon DD HH24:MI') AS ts,
             to_char(m.edited_at  AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS edited_at,
             to_char(m.deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS deleted_at,
             m.parent_msg_id,
             (SELECT COUNT(*) FROM collab_messages r
              WHERE r.parent_msg_id = m.id AND r.deleted_at IS NULL) AS reply_count,
             COALESCE(
               json_agg(
                 json_build_object('emoji', r.emoji, 'profile_id', r.profile_id::text)
               ) FILTER (WHERE r.emoji IS NOT NULL),
               '[]'::json
             ) AS raw_reactions
         FROM collab_messages m
         LEFT JOIN collab_reactions r ON r.message_id = m.id
         WHERE m.deployment_id = $1
           AND m.parent_msg_id IS NULL
           AND ($2::timestamptz IS NULL OR m.created_at > $2)
         GROUP BY m.id
         ORDER BY m.created_at ASC
         LIMIT 200",
    )
    .bind(params.deployment_id)
    .bind(params.after)
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let messages = rows
        .iter()
        .map(|row| {
            let raw: serde_json::Value = row
                .try_get("raw_reactions")
                .unwrap_or(serde_json::Value::Array(vec![]));
            let reactions = build_reaction_groups(raw);

            Ok(MessageRow {
                id: row.try_get::<Uuid, _>("id")?,
                deployment_id: row.try_get::<Uuid, _>("deployment_id")?,
                sender_id: row.try_get::<Uuid, _>("sender_id")?,
                sender_name: row.try_get::<String, _>("sender_name")?,
                body: row.try_get::<String, _>("body")?,
                file_name: row.try_get::<Option<String>, _>("file_name")?,
                file_path: row.try_get::<Option<String>, _>("file_path")?,
                ts: row.try_get::<String, _>("ts")?,
                edited_at: row.try_get::<Option<String>, _>("edited_at")?,
                deleted_at: row.try_get::<Option<String>, _>("deleted_at")?,
                parent_msg_id: row.try_get::<Option<Uuid>, _>("parent_msg_id")?,
                reply_count: row.try_get::<i64, _>("reply_count")?,
                reactions,
            })
        })
        .collect::<Result<Vec<MessageRow>, sqlx::Error>>()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(messages))
}

/// Collapse flat `[{emoji, profile_id}, ...]` JSON into grouped `ReactionGroup` vec.
pub fn build_reaction_groups(raw: serde_json::Value) -> Vec<ReactionGroup> {
    use std::collections::BTreeMap;
    let arr = match raw {
        serde_json::Value::Array(a) => a,
        _ => return vec![],
    };
    let mut groups: BTreeMap<String, Vec<Uuid>> = BTreeMap::new();
    for item in arr {
        let emoji = item
            .get("emoji")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let pid = item
            .get("profile_id")
            .and_then(|v| v.as_str())
            .and_then(|s| Uuid::parse_str(s).ok());
        if emoji.is_empty() {
            continue;
        }
        groups.entry(emoji).or_default().extend(pid);
    }
    groups
        .into_iter()
        .map(|(emoji, profile_ids)| ReactionGroup {
            count: profile_ids.len() as i64,
            emoji,
            profile_ids,
        })
        .collect()
}

pub async fn post_message(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<PostMessageBody>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, String)> {
    let profile_id = extract_profile_id(&headers)?;

    if body.sender_id != profile_id {
        return Err((
            StatusCode::FORBIDDEN,
            "sender_id does not match authenticated profile".to_string(),
        ));
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
    let dep_row =
        sqlx::query("SELECT client_id, freelancer_id, developer_id FROM deployments WHERE id = $1")
            .bind(body.deployment_id)
            .fetch_optional(&state.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Some(dep) = dep_row {
        let client_id: Uuid = dep.try_get("client_id").unwrap_or(profile_id);
        let freelancer_id: Uuid = dep.try_get("freelancer_id").unwrap_or(profile_id);
        let developer_id: Uuid = dep.try_get("developer_id").unwrap_or(profile_id);

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
                sender_id: body.sender_id,
                sender_name: body.sender_name.clone(),
                recipient_ids,
                body_preview: preview,
            };
            let envelope = EventEnvelope::new("MessageSent", &event);
            // Non-fatal: if Kafka is down, message is still saved
            if let Err(e) = state
                .producer
                .publish(
                    TOPIC_MESSAGE_SENT,
                    &body.deployment_id.to_string(),
                    &envelope,
                )
                .await
            {
                tracing::warn!(error=%e, "Failed to emit MessageSent — message saved, notification skipped");
            }
        }
    }

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "ok": true, "id": message_id })),
    ))
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

// ── Emoji allowlist ───────────────────────────────────────────────────────────

/// 40-entry emoji allowlist — identical on server and client.
const ALLOWED_EMOJI: &[&str] = &[
    "👍", "👎", "❤️", "🔥", "🎉", "😂", "😮", "😢", "🙏", "✅", "❌", "⚠️", "🚀", "💡", "🐛", "🔒",
    "📎", "📋", "⏳", "✏️", "💬", "🔄", "📌", "🏆", "💪", "👀", "🤔", "😅", "🎯", "🛡️", "💰", "📊",
    "🔗", "🧪", "⚡", "🌍", "🤝", "📢", "🔔", "💎",
];

// ── Task 7: File upload / serve constants and helpers ─────────────────────────

const MAX_UPLOAD_BYTES: usize = 26_214_400; // 25 MB

/// Map detected MIME type to a safe extension. Returns "bin" for unknown types.
fn mime_to_ext(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "application/pdf" => "pdf",
        "application/zip" => "zip",
        "application/wasm" => "wasm",
        "text/plain" => "txt",
        "application/json" => "json",
        "video/mp4" => "mp4",
        "video/webm" => "webm",
        _ => "bin",
    }
}

/// Validate slug format: `{36-char-uuid}.{1-10-char-ext}` — prevents path traversal.
/// Uses a character scan — no regex, no unwrap().
fn valid_slug(slug: &str) -> bool {
    let Some(dot_pos) = slug.rfind('.') else {
        return false;
    };
    let (base, ext) = (&slug[..dot_pos], &slug[dot_pos + 1..]);
    if base.len() != 36 {
        return false;
    }
    if !base.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return false;
    }
    if ext.is_empty() || ext.len() > 10 {
        return false;
    }
    if !ext
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
    {
        return false;
    }
    true
}

#[derive(Deserialize)]
pub struct UploadQuery {
    pub deployment_id: Uuid,
}

/// POST /collab/files?deployment_id=<uuid>
/// Multipart upload: field "file" (binary). Access check before bytes are read.
pub async fn upload_file(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<UploadQuery>,
    mut multipart: axum::extract::Multipart,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let profile_id = extract_profile_id(&headers)?;
    check_deployment_access(&state.db, params.deployment_id, profile_id).await?;

    let upload_dir =
        std::env::var("COLLAB_UPLOAD_DIR").unwrap_or_else(|_| "/tmp/collab-uploads".to_string());
    tokio::fs::create_dir_all(&upload_dir)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Find the "file" field in multipart
    let mut field = loop {
        match multipart
            .next_field()
            .await
            .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
        {
            Some(f) if f.name() == Some("file") => break f,
            Some(_) => continue,
            None => {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "No 'file' field in multipart".to_string(),
                ))
            }
        }
    };

    let original_name = field.file_name().unwrap_or("upload").to_string();

    // Read bytes with hard size limit on the stream
    let mut bytes_vec: Vec<u8> = Vec::with_capacity(65536);
    while let Some(chunk) = field
        .chunk()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    {
        bytes_vec.extend_from_slice(&chunk);
        if bytes_vec.len() > MAX_UPLOAD_BYTES {
            return Err((
                StatusCode::PAYLOAD_TOO_LARGE,
                "File exceeds 25 MB limit".to_string(),
            ));
        }
    }

    // MIME sniff → safe extension
    let ext = infer::get(&bytes_vec)
        .map(|t| mime_to_ext(t.mime_type()))
        .unwrap_or("bin");

    let slug = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let file_path = format!("{}/{}", upload_dir, slug);

    tokio::fs::write(&file_path, &bytes_vec)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Insert staging row for orphan cleanup
    sqlx::query(
        "INSERT INTO collab_file_uploads (file_path, deployment_id, profile_id)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING",
    )
    .bind(&slug)
    .bind(params.deployment_id)
    .bind(profile_id)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let url = format!("/api/collab/files/{}", slug);
    Ok(Json(serde_json::json!({
        "file_name": original_name,
        "file_path": slug,
        "url":       url,
    })))
}

/// GET /collab/files/:slug
/// Streams a file from disk after verifying the caller is a deployment participant.
pub async fn serve_file(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(slug): Path<String>,
) -> Result<axum::response::Response, (StatusCode, String)> {
    use axum::response::IntoResponse;

    let profile_id = extract_profile_id(&headers)?;

    if !valid_slug(&slug) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Invalid file slug format".to_string(),
        ));
    }

    // Look up owning deployment from committed messages first
    let msg_row =
        sqlx::query("SELECT deployment_id FROM collab_messages WHERE file_path = $1 LIMIT 1")
            .bind(&slug)
            .fetch_optional(&state.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let (deployment_id, is_staging) = if let Some(row) = msg_row {
        let did: Uuid = row
            .try_get("deployment_id")
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        (did, false)
    } else {
        // Check staging table — restrict to uploader only
        let stg = sqlx::query(
            "SELECT deployment_id, profile_id FROM collab_file_uploads WHERE file_path = $1",
        )
        .bind(&slug)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "File not found".to_string()))?;

        let owner: Uuid = stg
            .try_get("profile_id")
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        if owner != profile_id {
            return Err((
                StatusCode::FORBIDDEN,
                "Staging file only accessible to uploader".to_string(),
            ));
        }
        let did: Uuid = stg
            .try_get("deployment_id")
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        (did, true)
    };

    if !is_staging {
        check_deployment_access(&state.db, deployment_id, profile_id).await?;
    }

    let upload_dir =
        std::env::var("COLLAB_UPLOAD_DIR").unwrap_or_else(|_| "/tmp/collab-uploads".to_string());
    let file_path = format!("{}/{}", upload_dir, slug);

    let bytes = tokio::fs::read(&file_path)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "File not found on disk".to_string()))?;

    // MIME sniff for Content-Type
    let content_type = infer::get(&bytes)
        .map(|t| t.mime_type())
        .unwrap_or("application/octet-stream");

    Ok(([(axum::http::header::CONTENT_TYPE, content_type)], bytes).into_response())
}

// ── Additional body types ─────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct EditMessageBody {
    pub body: String,
}

#[derive(Deserialize)]
pub struct ToggleReactionBody {
    pub message_id: Uuid,
    pub emoji: String,
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
        return Err((
            StatusCode::FORBIDDEN,
            "Cannot query unread for another profile".to_string(),
        ));
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
           AND m.created_at > COALESCE(h.last_read_at, '1970-01-01'::timestamptz)
           AND m.parent_msg_id IS NULL",
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

// ── Task 4: Edit / Delete ─────────────────────────────────────────────────────

/// PATCH /collab/messages/:id
pub async fn edit_message(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(msg_id): Path<Uuid>,
    Json(body): Json<EditMessageBody>,
) -> Result<StatusCode, (StatusCode, String)> {
    let profile_id = extract_profile_id(&headers)?;

    let row = sqlx::query(
        "SELECT deployment_id, sender_id, deleted_at FROM collab_messages WHERE id = $1",
    )
    .bind(msg_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or_else(|| (StatusCode::NOT_FOUND, "Message not found".to_string()))?;

    let deployment_id: Uuid = row
        .try_get("deployment_id")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let sender_id: Uuid = row
        .try_get("sender_id")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let deleted_at: Option<chrono::DateTime<chrono::Utc>> = row
        .try_get("deleted_at")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    check_deployment_access(&state.db, deployment_id, profile_id).await?;

    if sender_id != profile_id {
        return Err((
            StatusCode::FORBIDDEN,
            "Cannot edit another user's message".to_string(),
        ));
    }
    if deleted_at.is_some() {
        return Err((
            StatusCode::FORBIDDEN,
            "Cannot edit a deleted message".to_string(),
        ));
    }

    sqlx::query("UPDATE collab_messages SET body = $1, edited_at = NOW() WHERE id = $2")
        .bind(&body.body)
        .bind(msg_id)
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /collab/messages/:id  (soft delete — sets deleted_at, never hard-deletes)
pub async fn delete_message(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(msg_id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, String)> {
    let profile_id = extract_profile_id(&headers)?;

    let row = sqlx::query("SELECT deployment_id, sender_id FROM collab_messages WHERE id = $1")
        .bind(msg_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Message not found".to_string()))?;

    let deployment_id: Uuid = row
        .try_get("deployment_id")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let sender_id: Uuid = row
        .try_get("sender_id")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    check_deployment_access(&state.db, deployment_id, profile_id).await?;

    if sender_id != profile_id {
        return Err((
            StatusCode::FORBIDDEN,
            "Cannot delete another user's message".to_string(),
        ));
    }

    sqlx::query("UPDATE collab_messages SET deleted_at = NOW() WHERE id = $1")
        .bind(msg_id)
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}

// ── Task 5: Reactions ─────────────────────────────────────────────────────────

/// POST /collab/reactions — toggle emoji reaction on a message
pub async fn toggle_reaction(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<ToggleReactionBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let profile_id = extract_profile_id(&headers)?;

    // 1. Look up message — 404 before access check
    let row = sqlx::query("SELECT deployment_id, deleted_at FROM collab_messages WHERE id = $1")
        .bind(body.message_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Message not found".to_string()))?;

    let deployment_id: Uuid = row
        .try_get("deployment_id")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let deleted_at: Option<chrono::DateTime<chrono::Utc>> = row
        .try_get("deleted_at")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // 2. Access check
    check_deployment_access(&state.db, deployment_id, profile_id).await?;

    // 3. Emoji allowlist validation
    if !ALLOWED_EMOJI.contains(&body.emoji.as_str()) {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            format!("Emoji '{}' is not in the allowed list", body.emoji),
        ));
    }

    // 4. Block reactions on deleted messages
    if deleted_at.is_some() {
        return Err((
            StatusCode::FORBIDDEN,
            "Cannot react to a deleted message".to_string(),
        ));
    }

    // 5. Toggle: delete if exists, insert if not
    let deleted = sqlx::query(
        "DELETE FROM collab_reactions
         WHERE message_id = $1 AND profile_id = $2 AND emoji = $3",
    )
    .bind(body.message_id)
    .bind(profile_id)
    .bind(&body.emoji)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .rows_affected();

    let action = if deleted > 0 {
        "removed"
    } else {
        sqlx::query(
            "INSERT INTO collab_reactions (message_id, profile_id, emoji)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING",
        )
        .bind(body.message_id)
        .bind(profile_id)
        .bind(&body.emoji)
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        "added"
    };

    Ok(Json(serde_json::json!({ "action": action })))
}

// ── Task 6: Thread fetch ──────────────────────────────────────────────────────

/// GET /collab/messages/:id/thread
/// Returns all replies to a given parent message, ordered ASC.
pub async fn list_thread(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(parent_id): Path<Uuid>,
) -> Result<Json<Vec<MessageRow>>, (StatusCode, String)> {
    let profile_id = extract_profile_id(&headers)?;

    // Verify parent message exists and get its deployment
    let parent = sqlx::query("SELECT deployment_id FROM collab_messages WHERE id = $1")
        .bind(parent_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "Parent message not found".to_string(),
            )
        })?;

    let deployment_id: Uuid = parent
        .try_get("deployment_id")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    check_deployment_access(&state.db, deployment_id, profile_id).await?;

    let rows = sqlx::query(
        "SELECT
             m.id, m.deployment_id, m.sender_id, m.sender_name,
             CASE WHEN m.deleted_at IS NOT NULL THEN '[deleted]' ELSE m.body END AS body,
             m.file_name,
             CASE WHEN m.deleted_at IS NOT NULL THEN NULL ELSE m.file_path END AS file_path,
             to_char(m.created_at AT TIME ZONE 'UTC', 'Mon DD HH24:MI') AS ts,
             to_char(m.edited_at  AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS edited_at,
             to_char(m.deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS deleted_at,
             m.parent_msg_id,
             0::bigint AS reply_count,
             COALESCE(
               json_agg(
                 json_build_object('emoji', r.emoji, 'profile_id', r.profile_id::text)
               ) FILTER (WHERE r.emoji IS NOT NULL),
               '[]'::json
             ) AS raw_reactions
         FROM collab_messages m
         LEFT JOIN collab_reactions r ON r.message_id = m.id
         WHERE m.parent_msg_id = $1
         GROUP BY m.id
         ORDER BY m.created_at ASC",
    )
    .bind(parent_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let messages = rows
        .iter()
        .map(|row| {
            let raw: serde_json::Value = row
                .try_get("raw_reactions")
                .unwrap_or(serde_json::Value::Array(vec![]));
            Ok(MessageRow {
                id: row.try_get::<Uuid, _>("id")?,
                deployment_id: row.try_get::<Uuid, _>("deployment_id")?,
                sender_id: row.try_get::<Uuid, _>("sender_id")?,
                sender_name: row.try_get::<String, _>("sender_name")?,
                body: row.try_get::<String, _>("body")?,
                file_name: row.try_get::<Option<String>, _>("file_name")?,
                file_path: row.try_get::<Option<String>, _>("file_path")?,
                ts: row.try_get::<String, _>("ts")?,
                edited_at: row.try_get::<Option<String>, _>("edited_at")?,
                deleted_at: row.try_get::<Option<String>, _>("deleted_at")?,
                parent_msg_id: row.try_get::<Option<Uuid>, _>("parent_msg_id")?,
                reply_count: row.try_get::<i64, _>("reply_count")?,
                reactions: build_reaction_groups(raw),
            })
        })
        .collect::<Result<Vec<MessageRow>, sqlx::Error>>()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(messages))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowlist_has_40_entries() {
        assert_eq!(ALLOWED_EMOJI.len(), 40);
    }

    #[test]
    fn thumbs_up_is_allowed() {
        assert!(ALLOWED_EMOJI.contains(&"👍"));
    }

    #[test]
    fn arbitrary_text_is_not_allowed() {
        assert!(!ALLOWED_EMOJI.contains(&"javascript"));
        assert!(!ALLOWED_EMOJI.contains(&"DROP TABLE"));
    }
}
