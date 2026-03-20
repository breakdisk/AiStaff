use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrationStatus {
    pub provider: String,
    pub status: String,
    pub display_name: Option<String>,
    pub connected_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitWhatsAppResponse {
    pub qr_url: String,
    pub nonce: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitMessengerResponse {
    pub link:  String,
    pub nonce: String,
}

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp
// ─────────────────────────────────────────────────────────────────────────────

pub async fn init_whatsapp_connect(
    pool: &PgPool,
    user_id: Uuid,
    wa_business_number: &str,
) -> Result<InitWhatsAppResponse> {
    let nonce = Uuid::now_v7().to_string();

    sqlx::query(
        "INSERT INTO connected_integrations (user_id, provider, status, nonce)
         VALUES ($1, 'whatsapp', 'pending', $2)
         ON CONFLICT (user_id, provider) DO UPDATE
             SET nonce       = $2,
                 status      = 'pending',
                 connected_at = NULL",
    )
    .bind(user_id)
    .bind(&nonce)
    .execute(pool)
    .await?;

    let number_digits = wa_business_number.trim_start_matches('+');
    let qr_url = format!("https://wa.me/{}?text=connect:{}", number_digits, nonce);

    Ok(InitWhatsAppResponse { qr_url, nonce })
}

pub async fn verify_whatsapp_webhook(pool: &PgPool, from_body: &str) -> Result<()> {
    // Expect a URL-encoded body or plain text containing "connect:{nonce}".
    let nonce = from_body
        .split("connect:")
        .nth(1)
        .and_then(|s| s.split('&').next())
        .map(|s| s.trim().to_string())
        .ok_or_else(|| anyhow!("WhatsApp webhook body missing connect nonce"))?;

    sqlx::query(
        "UPDATE connected_integrations
         SET status = 'verified', connected_at = NOW()
         WHERE nonce = $1 AND provider = 'whatsapp'",
    )
    .bind(&nonce)
    .execute(pool)
    .await?;

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Facebook Messenger
// ─────────────────────────────────────────────────────────────────────────────

pub async fn init_messenger_connect(
    pool: &PgPool,
    user_id: Uuid,
    page_username: &str,
) -> Result<InitMessengerResponse> {
    let nonce = Uuid::now_v7().to_string();

    sqlx::query(
        "INSERT INTO connected_integrations (user_id, provider, status, nonce)
         VALUES ($1, 'messenger', 'pending', $2)
         ON CONFLICT (user_id, provider) DO UPDATE
             SET nonce        = $2,
                 status       = 'pending',
                 connected_at = NULL",
    )
    .bind(user_id)
    .bind(&nonce)
    .execute(pool)
    .await?;

    let link = format!("https://m.me/{}?ref={}", page_username, nonce);

    Ok(InitMessengerResponse { link, nonce })
}

pub async fn verify_messenger_webhook(pool: &PgPool, from_body: &str) -> Result<()> {
    // Expect body containing "ref={nonce}" (Messenger sends this in the m.me ref parameter).
    let nonce = from_body
        .split("ref=")
        .nth(1)
        .and_then(|s| s.split('&').next())
        .map(|s| s.trim().to_string())
        .ok_or_else(|| anyhow!("Messenger webhook body missing ref nonce"))?;

    sqlx::query(
        "UPDATE connected_integrations
         SET status = 'verified', connected_at = NOW()
         WHERE nonce = $1 AND provider = 'messenger'",
    )
    .bind(&nonce)
    .execute(pool)
    .await?;

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Slack OAuth 2.0
// ─────────────────────────────────────────────────────────────────────────────

pub async fn init_slack_oauth(
    pool: &PgPool,
    user_id: Uuid,
    client_id: &str,
    redirect_uri: &str,
) -> Result<String> {
    let nonce = Uuid::now_v7().to_string();

    sqlx::query(
        "INSERT INTO connected_integrations (user_id, provider, status, nonce)
         VALUES ($1, 'slack', 'pending', $2)
         ON CONFLICT (user_id, provider) DO UPDATE
             SET nonce  = $2,
                 status = 'pending'",
    )
    .bind(user_id)
    .bind(&nonce)
    .execute(pool)
    .await?;

    let url = format!(
        "https://slack.com/oauth/v2/authorize?client_id={}&state={}&scope=incoming-webhook&redirect_uri={}",
        client_id,
        nonce,
        urlencoding::encode(redirect_uri)
    );

    Ok(url)
}

#[derive(Debug, Deserialize)]
struct SlackOAuthResponse {
    incoming_webhook: Option<SlackWebhook>,
    team: Option<SlackTeam>,
}

#[derive(Debug, Deserialize)]
struct SlackWebhook {
    url: String,
}

#[derive(Debug, Deserialize)]
struct SlackTeam {
    name: String,
}

pub async fn complete_slack_oauth(
    pool: &PgPool,
    state: &str,
    code: &str,
    client_id: &str,
    client_secret: &str,
) -> Result<()> {
    let client = reqwest::Client::new();
    let res = client
        .post("https://slack.com/api/oauth.v2.access")
        .form(&[
            ("code", code),
            ("client_id", client_id),
            ("client_secret", client_secret),
        ])
        .send()
        .await?
        .json::<SlackOAuthResponse>()
        .await?;

    let webhook_url = res
        .incoming_webhook
        .as_ref()
        .map(|w| w.url.as_str())
        .unwrap_or("");

    let team_name = res
        .team
        .as_ref()
        .map(|t| t.name.as_str())
        .unwrap_or("Slack");

    sqlx::query(
        "UPDATE connected_integrations
         SET status       = 'verified',
             webhook_url  = $2,
             display_name = $3,
             connected_at = NOW()
         WHERE nonce = $1",
    )
    .bind(state)
    .bind(webhook_url)
    .bind(team_name)
    .execute(pool)
    .await?;

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Microsoft Teams webhook
// ─────────────────────────────────────────────────────────────────────────────

pub async fn save_teams_webhook(pool: &PgPool, user_id: Uuid, webhook_url: &str) -> Result<()> {
    if !webhook_url.starts_with("https://") {
        return Err(anyhow!("Teams webhook URL must use HTTPS"));
    }

    sqlx::query(
        "INSERT INTO connected_integrations
             (user_id, provider, status, webhook_url, connected_at)
         VALUES ($1, 'teams', 'verified', $2, NOW())
         ON CONFLICT (user_id, provider) DO UPDATE
             SET status      = 'verified',
                 webhook_url = $2,
                 connected_at = NOW()",
    )
    .bind(user_id)
    .bind(webhook_url)
    .execute(pool)
    .await?;

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Calendar OAuth 2.0
// ─────────────────────────────────────────────────────────────────────────────

pub async fn init_google_oauth(
    pool: &PgPool,
    user_id: Uuid,
    client_id: &str,
    redirect_uri: &str,
) -> Result<String> {
    let nonce = Uuid::now_v7().to_string();

    sqlx::query(
        "INSERT INTO connected_integrations (user_id, provider, status, nonce)
         VALUES ($1, 'google_calendar', 'pending', $2)
         ON CONFLICT (user_id, provider) DO UPDATE
             SET nonce  = $2,
                 status = 'pending'",
    )
    .bind(user_id)
    .bind(&nonce)
    .execute(pool)
    .await?;

    let scope = "https://www.googleapis.com/auth/calendar";
    let url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth\
         ?client_id={}\
         &redirect_uri={}\
         &response_type=code\
         &scope={}\
         &state={}\
         &access_type=offline",
        client_id,
        urlencoding::encode(redirect_uri),
        urlencoding::encode(scope),
        nonce,
    );

    Ok(url)
}

#[derive(Debug, Deserialize)]
struct GoogleTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
}

pub async fn complete_google_oauth(
    pool: &PgPool,
    state: &str,
    code: &str,
    client_id: &str,
    client_secret: &str,
    redirect_uri: &str,
    enc_key: &str,
) -> Result<()> {
    let client = reqwest::Client::new();
    let token_res = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await?
        .json::<GoogleTokenResponse>()
        .await?;

    let access_enc = encrypt_token(&token_res.access_token, enc_key)?;
    let refresh_enc = token_res
        .refresh_token
        .as_deref()
        .map(|t| encrypt_token(t, enc_key))
        .transpose()?;

    let expires_secs = token_res.expires_in.unwrap_or(3600);

    sqlx::query(
        "UPDATE connected_integrations
         SET status        = 'verified',
             access_token  = $2,
             refresh_token = $3,
             expires_at    = NOW() + ($4 * INTERVAL '1 second'),
             display_name  = 'google_calendar',
             connected_at  = NOW()
         WHERE nonce = $1",
    )
    .bind(state)
    .bind(&access_enc)
    .bind(refresh_enc.as_deref())
    .bind(expires_secs)
    .execute(pool)
    .await?;

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Read / revoke
// ─────────────────────────────────────────────────────────────────────────────

pub async fn get_integrations(pool: &PgPool, user_id: Uuid) -> Result<Vec<IntegrationStatus>> {
    use sqlx::Row;

    let rows = sqlx::query(
        "SELECT provider, status, display_name, connected_at::TEXT
         FROM connected_integrations
         WHERE user_id = $1
         ORDER BY provider",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    let results = rows
        .into_iter()
        .map(|r| IntegrationStatus {
            provider: r.try_get("provider").unwrap_or_default(),
            status: r.try_get("status").unwrap_or_default(),
            display_name: r.try_get("display_name").ok().flatten(),
            connected_at: r.try_get("connected_at").ok().flatten(),
        })
        .collect();

    Ok(results)
}

pub async fn revoke_integration(pool: &PgPool, user_id: Uuid, provider: &str) -> Result<()> {
    sqlx::query(
        "UPDATE connected_integrations
         SET status        = 'revoked',
             access_token  = NULL,
             refresh_token = NULL,
             webhook_url   = NULL
         WHERE user_id = $1 AND provider = $2",
    )
    .bind(user_id)
    .bind(provider)
    .execute(pool)
    .await?;

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Encryption helper (AES-256-GCM)
// ─────────────────────────────────────────────────────────────────────────────

pub fn encrypt_token(value: &str, key_b64: &str) -> Result<String> {
    let key_bytes = B64
        .decode(key_b64)
        .map_err(|e| anyhow!("failed to base64-decode encryption key: {e}"))?;

    if key_bytes.len() != 32 {
        return Err(anyhow!(
            "encryption key must be 32 bytes, got {}",
            key_bytes.len()
        ));
    }

    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|e| anyhow!("AES-256-GCM key init failed: {e}"))?;

    // Use the first 12 bytes of a time-ordered UUID v7 as the nonce.
    // This guarantees uniqueness without requiring a CSPRNG call.
    let id_bytes = Uuid::now_v7();
    let nonce_bytes = &id_bytes.as_bytes()[..12];
    let nonce = Nonce::from_slice(nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, value.as_bytes())
        .map_err(|e| anyhow!("AES-256-GCM encryption failed: {e}"))?;

    // Layout: [12-byte nonce][ciphertext+tag] — base64-encoded.
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);

    Ok(B64.encode(&combined))
}
