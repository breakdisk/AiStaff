use crate::fanout::{AppConfig, Fanout};
use crate::integrations;
use crate::prefs;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

// ─────────────────────────────────────────────────────────────────────────────
// Shared application state
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    #[allow(dead_code)]
    pub fanout: Arc<Fanout>,
    pub config: Arc<AppConfig>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Query / body types
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct NotifQuery {
    pub user_id: Uuid,
    pub unread: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UserQuery {
    pub user_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct UserBody {
    pub user_id: Uuid,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SavePrefsBody {
    pub user_id: Uuid,
    #[serde(flatten)]
    pub prefs: prefs::NotifPrefs,
}

#[derive(Debug, Deserialize)]
pub struct DeviceTokenBody {
    pub user_id: Uuid,
    pub token: String,
    pub platform: String,
}

#[derive(Debug, Deserialize)]
pub struct TeamsWebhookBody {
    pub user_id: Uuid,
    pub webhook_url: String,
}

#[derive(Debug, Deserialize)]
pub struct OAuthCallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification list / count / read
// ─────────────────────────────────────────────────────────────────────────────

/// GET /notifications?user_id=UUID[&unread=true]
pub async fn list_notifications(
    State(s): State<AppState>,
    Query(q): Query<NotifQuery>,
) -> impl IntoResponse {
    let result = if q.unread.unwrap_or(false) {
        sqlx::query(
            "SELECT id::TEXT, recipient::TEXT, channel::TEXT, subject, body,
                    sent_at::TEXT, failed_at::TEXT, created_at::TEXT
             FROM in_app_notifications
             WHERE user_id = $1 AND read_at IS NULL
             ORDER BY created_at DESC
             LIMIT 100",
        )
        .bind(q.user_id)
        .fetch_all(&s.db)
        .await
    } else {
        sqlx::query(
            "SELECT id::TEXT, recipient::TEXT, channel::TEXT, subject, body,
                    sent_at::TEXT, failed_at::TEXT, created_at::TEXT
             FROM in_app_notifications
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 100",
        )
        .bind(q.user_id)
        .fetch_all(&s.db)
        .await
    };

    match result {
        Ok(rows) => {
            use sqlx::Row;
            let items: Vec<serde_json::Value> = rows
                .into_iter()
                .map(|r| {
                    json!({
                        "id":         r.try_get::<String, _>("id").unwrap_or_default(),
                        "title":      r.try_get::<String, _>("subject").unwrap_or_default(),
                        "body":       r.try_get::<String, _>("body").unwrap_or_default(),
                        "sent_at":    r.try_get::<Option<String>, _>("sent_at").ok().flatten(),
                        "failed_at":  r.try_get::<Option<String>, _>("failed_at").ok().flatten(),
                        "created_at": r.try_get::<Option<String>, _>("created_at").ok().flatten(),
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!({ "notifications": items }))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// GET /notifications/count?user_id=UUID
pub async fn count_unread(
    State(s): State<AppState>,
    Query(q): Query<UserQuery>,
) -> impl IntoResponse {
    let result = sqlx::query(
        "SELECT COUNT(*) AS cnt FROM in_app_notifications
         WHERE user_id = $1 AND read_at IS NULL",
    )
    .bind(q.user_id)
    .fetch_one(&s.db)
    .await;

    match result {
        Ok(row) => {
            use sqlx::Row;
            let cnt: i64 = row.try_get("cnt").unwrap_or(0);
            (StatusCode::OK, Json(json!({ "unread_count": cnt }))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// PATCH /notifications/:id/read?user_id=UUID
pub async fn mark_read(
    State(s): State<AppState>,
    Path(id): Path<Uuid>,
    Query(q): Query<UserQuery>,
) -> impl IntoResponse {
    let result = sqlx::query(
        "UPDATE in_app_notifications SET read_at = NOW()
         WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(q.user_id)
    .execute(&s.db)
    .await;

    match result {
        Ok(_) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// POST /notifications/read-all  body: { user_id }
pub async fn mark_all_read(
    State(s): State<AppState>,
    Json(b): Json<UserBody>,
) -> impl IntoResponse {
    let result = sqlx::query(
        "UPDATE in_app_notifications SET read_at = NOW()
         WHERE user_id = $1 AND read_at IS NULL",
    )
    .bind(b.user_id)
    .execute(&s.db)
    .await;

    match result {
        Ok(r) => (
            StatusCode::OK,
            Json(json!({ "ok": true, "updated": r.rows_affected() })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification preferences
// ─────────────────────────────────────────────────────────────────────────────

/// GET /notification-preferences?user_id=UUID
pub async fn get_prefs_handler(
    State(s): State<AppState>,
    Query(q): Query<UserQuery>,
) -> impl IntoResponse {
    match prefs::get_prefs(&s.db, q.user_id).await {
        Ok(p) => (StatusCode::OK, Json(json!(p))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// POST /notification-preferences  body: NotifPrefs + user_id
pub async fn save_prefs_handler(
    State(s): State<AppState>,
    Json(b): Json<SavePrefsBody>,
) -> impl IntoResponse {
    match prefs::upsert_prefs(&s.db, b.user_id, &b.prefs).await {
        Ok(()) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Device tokens (push)
// ─────────────────────────────────────────────────────────────────────────────

/// POST /device-tokens  body: { user_id, token, platform }
pub async fn register_device_token(
    State(s): State<AppState>,
    Json(b): Json<DeviceTokenBody>,
) -> impl IntoResponse {
    let result = sqlx::query(
        "INSERT INTO device_tokens (user_id, token, platform, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (token) DO UPDATE SET user_id = $1, platform = $3, updated_at = NOW()",
    )
    .bind(b.user_id)
    .bind(&b.token)
    .bind(&b.platform)
    .execute(&s.db)
    .await;

    match result {
        Ok(_) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// DELETE /device-tokens/:token?user_id=UUID
pub async fn unregister_device_token(
    State(s): State<AppState>,
    Path(token): Path<String>,
    Query(q): Query<UserQuery>,
) -> impl IntoResponse {
    let result = sqlx::query("DELETE FROM device_tokens WHERE token = $1 AND user_id = $2")
        .bind(&token)
        .bind(q.user_id)
        .execute(&s.db)
        .await;

    match result {
        Ok(_) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp integration
// ─────────────────────────────────────────────────────────────────────────────

/// POST /integrations/whatsapp/init  body: { user_id }
pub async fn init_whatsapp(
    State(s): State<AppState>,
    Json(b): Json<UserBody>,
) -> impl IntoResponse {
    match integrations::init_whatsapp_connect(&s.db, b.user_id, &s.config.twilio_whatsapp_number)
        .await
    {
        Ok(r) => (StatusCode::OK, Json(json!(r))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// POST /integrations/whatsapp/webhook  body: Twilio form-encoded message body
pub async fn whatsapp_webhook(State(s): State<AppState>, body: String) -> impl IntoResponse {
    match integrations::verify_whatsapp_webhook(&s.db, &body).await {
        Ok(()) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => {
            tracing::warn!(error=%e, "WhatsApp webhook verification failed");
            (StatusCode::OK, Json(json!({ "ok": true }))).into_response()
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Messenger integration
// ─────────────────────────────────────────────────────────────────────────────

/// POST /integrations/messenger/init  body: { user_id }
pub async fn init_messenger(
    State(s): State<AppState>,
    Json(b): Json<UserBody>,
) -> impl IntoResponse {
    match integrations::init_messenger_connect(
        &s.db,
        b.user_id,
        &s.config.messenger_page_username,
    )
    .await
    {
        Ok(r) => (StatusCode::OK, Json(json!(r))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// POST /integrations/messenger/webhook  body: plain text containing ref={nonce}
pub async fn messenger_webhook(
    State(s): State<AppState>,
    body: String,
) -> impl IntoResponse {
    match integrations::verify_messenger_webhook(&s.db, &body).await {
        Ok(()) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => {
            tracing::warn!(error=%e, "Messenger webhook verification failed");
            (StatusCode::OK, Json(json!({ "ok": true }))).into_response()
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Slack OAuth
// ─────────────────────────────────────────────────────────────────────────────

/// GET /integrations/slack/oauth?user_id=UUID
pub async fn slack_oauth_init(
    State(s): State<AppState>,
    Query(q): Query<UserQuery>,
) -> impl IntoResponse {
    let redirect_uri = format!("{}/integrations/slack/callback", s.config.base_url);
    match integrations::init_slack_oauth(&s.db, q.user_id, &s.config.slack_client_id, &redirect_uri)
        .await
    {
        Ok(url) => (StatusCode::OK, Json(json!({ "auth_url": url }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// GET /integrations/slack/callback?code=&state=
pub async fn slack_oauth_callback(
    State(s): State<AppState>,
    Query(q): Query<OAuthCallbackQuery>,
) -> impl IntoResponse {
    let (code, state) = match (q.code.as_deref(), q.state.as_deref()) {
        (Some(c), Some(st)) => (c.to_string(), st.to_string()),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "missing code or state" })),
            )
                .into_response()
        }
    };

    match integrations::complete_slack_oauth(
        &s.db,
        &state,
        &code,
        &s.config.slack_client_id,
        &s.config.slack_client_secret,
    )
    .await
    {
        Ok(()) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Teams webhook
// ─────────────────────────────────────────────────────────────────────────────

/// POST /integrations/teams/webhook  body: { user_id, webhook_url }
pub async fn save_teams(
    State(s): State<AppState>,
    Json(b): Json<TeamsWebhookBody>,
) -> impl IntoResponse {
    match integrations::save_teams_webhook(&s.db, b.user_id, &b.webhook_url).await {
        Ok(()) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Google OAuth
// ─────────────────────────────────────────────────────────────────────────────

/// GET /integrations/google/oauth?user_id=UUID
pub async fn google_oauth_init(
    State(s): State<AppState>,
    Query(q): Query<UserQuery>,
) -> impl IntoResponse {
    let redirect_uri = format!("{}/integrations/google/callback", s.config.base_url);
    match integrations::init_google_oauth(
        &s.db,
        q.user_id,
        &s.config.google_client_id,
        &redirect_uri,
    )
    .await
    {
        Ok(url) => (StatusCode::OK, Json(json!({ "auth_url": url }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// GET /integrations/google/callback?code=&state=
pub async fn google_oauth_callback(
    State(s): State<AppState>,
    Query(q): Query<OAuthCallbackQuery>,
) -> impl IntoResponse {
    let (code, state) = match (q.code.as_deref(), q.state.as_deref()) {
        (Some(c), Some(st)) => (c.to_string(), st.to_string()),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "missing code or state" })),
            )
                .into_response()
        }
    };

    let redirect_uri = format!("{}/integrations/google/callback", s.config.base_url);

    match integrations::complete_google_oauth(
        &s.db,
        &state,
        &code,
        &s.config.google_client_id,
        &s.config.google_client_secret,
        &redirect_uri,
        &s.config.encryption_key_b64,
    )
    .await
    {
        Ok(()) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Integration status / revoke
// ─────────────────────────────────────────────────────────────────────────────

/// GET /integrations/status?user_id=UUID
pub async fn integration_status(
    State(s): State<AppState>,
    Query(q): Query<UserQuery>,
) -> impl IntoResponse {
    match integrations::get_integrations(&s.db, q.user_id).await {
        Ok(list) => (StatusCode::OK, Json(json!({ "integrations": list }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic email send (used by web layer for contract and proposal emails)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct NotifyBody {
    pub recipient_email: String,
    pub subject: String,
    pub body: String,
}

/// POST /notify  { recipient_email, subject, body }
/// Sends a transactional email via SMTP. recipient UUID is nil (no platform user required).
pub async fn send_notify(
    State(s): State<AppState>,
    Json(req): Json<NotifyBody>,
) -> impl IntoResponse {
    match s
        .fanout
        .dispatch_email(Uuid::nil(), &req.recipient_email, &req.subject, &req.body)
        .await
    {
        Ok(_) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "ok": false, "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// DELETE /integrations/:provider?user_id=UUID
pub async fn revoke_integration(
    State(s): State<AppState>,
    Path(provider): Path<String>,
    Query(q): Query<UserQuery>,
) -> impl IntoResponse {
    match integrations::revoke_integration(&s.db, q.user_id, &provider).await {
        Ok(()) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}
