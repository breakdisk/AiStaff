use std::sync::Arc;

use axum::{
    extract::{FromRef, Path, State},
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::{delete, get, patch, post},
    Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use dotenvy::dotenv;
use sqlx::postgres::PgPoolOptions;
use tracing_subscriber::{fmt, EnvFilter};

/// Composite app state — lets Axum extract each field independently via `FromRef`.
#[derive(Clone)]
struct AppState {
    svc:  Arc<StitchService>,
    pool: sqlx::PgPool,
}

impl FromRef<AppState> for Arc<StitchService> {
    fn from_ref(s: &AppState) -> Self { s.svc.clone() }
}

impl FromRef<AppState> for sqlx::PgPool {
    fn from_ref(s: &AppState) -> Self { s.pool.clone() }
}

mod handlers;
mod oauth_handler;
mod openid4vp;
mod stitch_logic;
mod trust_score;
mod zk_verifier;

use common::types::identity::OAuthCallbackPayload;
use stitch_logic::{StitchConfig, StitchService};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv().ok();
    fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .json()
        .init();

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let zk_vk_path = std::env::var("ZK_VERIFYING_KEY_PATH")
        .unwrap_or_else(|_| "./config/liveness_vk.bin".into());

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&db_url)
        .await?;

    sqlx::migrate!("../../migrations").run(&pool).await?;

    let zk_verifying_key = std::fs::read(&zk_vk_path).unwrap_or_else(|_| {
        tracing::warn!(path = %zk_vk_path, "ZK verifying key not found — ZK verification will fail");
        vec![]
    });

    let config = Arc::new(StitchConfig { zk_verifying_key });
    let svc = Arc::new(StitchService::new(pool.clone(), config));

    let state = AppState { svc, pool };

    let app = Router::new()
        .route("/health", get(handlers::health))
        // Legacy stitch endpoint (GitHub + LinkedIn together)
        .route("/identity/stitch", post(handlers::stitch_identity))
        .route("/identity/wallet-redirect", get(handlers::wallet_redirect))
        .route("/identity/biometric-callback", post(handlers::biometric_callback))
        // Single-provider OAuth (migration 0016)
        .route("/identity/oauth-callback", post(oauth_callback))
        .route("/identity/connect-provider", post(connect_provider))
        // ZK nonce request (migration 0018)
        .route("/identity/nonce-request", post(nonce_request))
        // Freelancer profile update (migration 0017)
        .route("/profile/{id}", patch(update_profile))
        // Provider disconnect + audit log (migration 0018)
        .route("/profile/{id}/provider/{provider}", delete(disconnect_provider))
        // Public profile endpoint (trust score + tier for marketplace)
        .route("/identity/public-profile/{id}", get(public_profile))
        // Agency registration
        .route("/agencies", post(create_agency))
        .with_state(state);

    let addr = "0.0.0.0:3001";
    tracing::info!("identity_service listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

// ── POST /identity/oauth-callback ─────────────────────────────────────────────
// Called by Next.js auth.ts jwt callback after any OAuth provider sign-in.

async fn oauth_callback(
    State(pool): State<sqlx::PgPool>,
    Json(payload): Json<OAuthCallbackPayload>,
) -> impl IntoResponse {
    match oauth_handler::handle_oauth_callback(&pool, payload).await {
        Ok(resp) => Json(resp).into_response(),
        Err(e) => {
            tracing::error!("oauth_callback: {e:#}");
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
        }
    }
}

// ── PATCH /profile/{id} ───────────────────────────────────────────────────────
// Updates mutable freelancer profile fields (bio, hourly_rate_cents, availability, role).

#[derive(Debug, Deserialize)]
struct UpdateProfilePayload {
    bio:               Option<String>,
    hourly_rate_cents: Option<i32>,
    availability:      Option<String>,
    role:              Option<String>,
}

async fn update_profile(
    State(pool): State<sqlx::PgPool>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateProfilePayload>,
) -> impl IntoResponse {
    let res = sqlx::query(
        "UPDATE unified_profiles
         SET bio               = COALESCE($2, bio),
             hourly_rate_cents = COALESCE($3, hourly_rate_cents),
             availability      = COALESCE($4, availability),
             role              = COALESCE($5, role),
             updated_at        = NOW()
         WHERE id = $1",
    )
    .bind(id)
    .bind(&payload.bio)
    .bind(payload.hourly_rate_cents)
    .bind(&payload.availability)
    .bind(&payload.role)
    .execute(&pool)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => StatusCode::NOT_FOUND.into_response(),
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => {
            tracing::error!("update_profile: {e:#}");
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
        }
    }
}

// ── POST /identity/connect-provider ──────────────────────────────────────────
// Called when an authenticated user links an additional OAuth provider.
// Payload must include `existing_profile_id`.

async fn connect_provider(
    State(pool): State<sqlx::PgPool>,
    Json(payload): Json<OAuthCallbackPayload>,
) -> impl IntoResponse {
    if payload.existing_profile_id.is_none() {
        return (
            StatusCode::BAD_REQUEST,
            "existing_profile_id required for connect-provider",
        )
            .into_response();
    }
    match oauth_handler::handle_oauth_callback(&pool, payload).await {
        Ok(resp) => Json(resp).into_response(),
        Err(e) => {
            tracing::error!("connect_provider: {e:#}");
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
        }
    }
}

// ── POST /identity/nonce-request ─────────────────────────────────────────────
// Issues a single-use 10-minute nonce for ZK biometric proof submission.
// Returns the nonce + wallet deep-link URL.

#[derive(Debug, Deserialize)]
struct NonceRequestPayload {
    profile_id: Uuid,
}

#[derive(Debug, Serialize)]
struct NonceResponse {
    nonce_hex:       String,
    expires_at:      String,
    wallet_deep_link: String,
}

async fn nonce_request(
    State(pool): State<sqlx::PgPool>,
    Json(payload): Json<NonceRequestPayload>,
) -> impl IntoResponse {
    // Generate 32-byte nonce from UUID v4 randomness + blake3
    let raw = Uuid::new_v4();
    let nonce_hex = hex::encode(
        blake3::hash(raw.as_bytes()).as_bytes()
    );

    let res = sqlx::query(
        "INSERT INTO biometric_nonces (profile_id, nonce_hex)
         VALUES ($1, $2)
         RETURNING expires_at",
    )
    .bind(payload.profile_id)
    .bind(&nonce_hex)
    .fetch_one(&pool)
    .await;

    match res {
        Ok(row) => {
            use sqlx::Row;
            let expires_at: chrono::DateTime<chrono::Utc> = row.get("expires_at");
            let base_url = std::env::var("API_BASE_URL")
                .unwrap_or_else(|_| "https://api.aistaffglobal.com".into());
            let wallet_deep_link = format!(
                "openid4vp://present?request_uri={base_url}/identity/biometric-callback\
                 &nonce={nonce_hex}&profile_id={pid}",
                nonce_hex = nonce_hex,
                pid = payload.profile_id
            );
            Json(NonceResponse {
                nonce_hex,
                expires_at: expires_at.to_rfc3339(),
                wallet_deep_link,
            })
            .into_response()
        }
        Err(e) => {
            tracing::error!("nonce_request: {e:#}");
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
        }
    }
}

// ── GET /identity/public-profile/:id ─────────────────────────────────────────
// Returns public-facing profile data (trust score, tier, display name).
// No auth required — used by marketplace to show live credential badges.

#[derive(Debug, Serialize)]
struct PublicProfileResponse {
    profile_id:    Uuid,
    display_name:  String,
    trust_score:   i16,
    identity_tier: String,
    github_connected:   bool,
    linkedin_connected: bool,
    google_connected:   bool,
    // Added in migration 0017 — used by matching page for candidate enrichment
    bio:               Option<String>,
    hourly_rate_cents: Option<i32>,
    availability:      Option<String>,
    role:              Option<String>,
}

async fn public_profile(
    State(pool): State<sqlx::PgPool>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    use sqlx::Row;

    let res = sqlx::query(
        "SELECT display_name, trust_score, identity_tier::TEXT AS identity_tier,
                github_uid, linkedin_uid, google_uid,
                bio, hourly_rate_cents, availability, role
         FROM unified_profiles WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await;

    match res {
        Ok(Some(row)) => {
            let display_name: String = row.get("display_name");
            let trust_score: i16 = row.get("trust_score");
            let identity_tier: String = row.get("identity_tier");
            let github_uid: Option<String> = row.get("github_uid");
            let linkedin_uid: Option<String> = row.get("linkedin_uid");
            let google_uid: Option<String> = row.get("google_uid");
            let bio: Option<String> = row.get("bio");
            let hourly_rate_cents: Option<i32> = row.get("hourly_rate_cents");
            let availability: Option<String> = row.get("availability");
            let role: Option<String> = row.get("role");

            Json(PublicProfileResponse {
                profile_id: id,
                display_name,
                trust_score,
                identity_tier,
                github_connected:   github_uid.is_some(),
                linkedin_connected: linkedin_uid.is_some(),
                google_connected:   google_uid.is_some(),
                bio,
                hourly_rate_cents,
                availability,
                role,
            })
            .into_response()
        }
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => {
            tracing::error!("public_profile: {e:#}");
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
        }
    }
}

// ── DELETE /profile/:id/provider/:provider ────────────────────────────────────
// Unlinks an OAuth provider from a profile, recalculates trust_score + tier,
// and appends an audit log entry.

async fn disconnect_provider(
    State(pool): State<sqlx::PgPool>,
    Path((id, provider)): Path<(Uuid, String)>,
) -> impl IntoResponse {
    use sqlx::Row;

    // Fetch current score + tier before change
    let before = sqlx::query(
        "SELECT trust_score, identity_tier::TEXT AS identity_tier
         FROM unified_profiles WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await;

    let (old_score, old_tier) = match before {
        Ok(Some(r)) => {
            let s: i16 = r.get("trust_score");
            let t: String = r.get("identity_tier");
            (s, t)
        }
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    // Null the provider column
    let update_sql = match provider.as_str() {
        "github" =>
            "UPDATE unified_profiles SET github_uid = NULL, github_connected_at = NULL, updated_at = NOW() WHERE id = $1",
        "google" =>
            "UPDATE unified_profiles SET google_uid = NULL, google_connected_at = NULL, updated_at = NOW() WHERE id = $1",
        "linkedin" =>
            "UPDATE unified_profiles SET linkedin_uid = NULL, linkedin_connected_at = NULL, updated_at = NOW() WHERE id = $1",
        _ => return (StatusCode::BAD_REQUEST, "provider must be github|google|linkedin").into_response(),
    };

    if let Err(e) = sqlx::query(update_sql).bind(id).execute(&pool).await {
        tracing::error!("disconnect_provider update: {e:#}");
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    // Recalculate trust score from remaining providers
    let row = sqlx::query(
        "SELECT github_uid, linkedin_uid, google_uid FROM unified_profiles WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&pool)
    .await;

    let (new_score, new_tier) = match row {
        Ok(r) => {
            let gh: Option<String> = r.get("github_uid");
            let li: Option<String> = r.get("linkedin_uid");
            let go: Option<String> = r.get("google_uid");
            let score: i16 = (if gh.is_some() { 10.0_f64 } else { 0.0 }
                + if li.is_some() { 15.0 } else { 0.0 }
                + if go.is_some() { 15.0 } else { 0.0 })
                .round() as i16;
            let tier = if score > 0 { "SOCIAL_VERIFIED" } else { "UNVERIFIED" };
            (score, tier.to_string())
        }
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    // Persist new score + tier
    if let Err(e) = sqlx::query(
        "UPDATE unified_profiles SET trust_score = $1, identity_tier = $2, updated_at = NOW() WHERE id = $3",
    )
    .bind(new_score)
    .bind(&new_tier)
    .bind(id)
    .execute(&pool)
    .await
    {
        tracing::error!("disconnect_provider score update: {e:#}");
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    // Append audit log
    let _ = sqlx::query(
        "INSERT INTO identity_audit_log
             (profile_id, event_type, event_data, old_tier, new_tier, old_score, new_score, actor_id)
         VALUES ($1, 'PROVIDER_DISCONNECTED', $2, $3, $4, $5, $6, $1)",
    )
    .bind(id)
    .bind(serde_json::json!({ "provider": provider }))
    .bind(&old_tier)
    .bind(&new_tier)
    .bind(old_score)
    .bind(new_score)
    .execute(&pool)
    .await;

    tracing::info!(%id, provider = %provider, "provider disconnected, trust_score recalculated");

    Json(serde_json::json!({
        "ok": true,
        "trust_score": new_score,
        "identity_tier": new_tier,
    }))
    .into_response()
}

// ── POST /agencies ─────────────────────────────────────────────────────────────
// Creates an agency org record and marks the owner's profile as account_type='agency'.
// Idempotency: `handle` is UNIQUE — duplicate returns 409.

#[derive(Debug, Deserialize)]
struct CreateAgencyPayload {
    owner_id:    Uuid,
    name:        String,
    handle:      String,
    description: Option<String>,
    website_url: Option<String>,
}

#[derive(Debug, Serialize)]
struct CreateAgencyResponse {
    agency_id:  Uuid,
    handle:     String,
    name:       String,
    created_at: String,
}

async fn create_agency(
    State(pool): State<sqlx::PgPool>,
    Json(payload): Json<CreateAgencyPayload>,
) -> impl IntoResponse {
    use sqlx::Row;

    let handle = payload.handle.trim().to_lowercase();

    if handle.len() < 3 || handle.len() > 40 {
        return (StatusCode::BAD_REQUEST, "handle must be 3–40 characters").into_response();
    }
    if !handle.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return (StatusCode::BAD_REQUEST,
            "handle must be lowercase alphanumeric or hyphens").into_response();
    }

    let agency_id = Uuid::now_v7();

    // Both writes (profile update + agency insert) run inside a transaction.
    // If the handle is already taken the UNIQUE violation rolls back the profile
    // update too — no partial state left behind.
    let mut tx = match pool.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!("create_agency begin tx: {e:#}");
            return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    };

    // Mark the owner's profile as an agency account + set role.
    if let Err(e) = sqlx::query(
        "UPDATE unified_profiles
         SET account_type = 'agency', role = 'agent-owner', org_name = $2, updated_at = NOW()
         WHERE id = $1",
    )
    .bind(payload.owner_id)
    .bind(&payload.name)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("create_agency profile update: {e:#}");
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    // Insert the agency record.
    let result = sqlx::query(
        "INSERT INTO agencies (id, owner_id, name, handle, description, website_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING created_at",
    )
    .bind(agency_id)
    .bind(payload.owner_id)
    .bind(&payload.name)
    .bind(&handle)
    .bind(&payload.description)
    .bind(&payload.website_url)
    .fetch_one(&mut *tx)
    .await;

    match result {
        Ok(row) => {
            if let Err(e) = tx.commit().await {
                tracing::error!("create_agency commit: {e:#}");
                return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
            }
            let created_at: chrono::DateTime<chrono::Utc> = row.get("created_at");
            tracing::info!(%agency_id, handle = %handle, "agency created");
            (
                StatusCode::CREATED,
                Json(CreateAgencyResponse {
                    agency_id,
                    handle,
                    name: payload.name,
                    created_at: created_at.to_rfc3339(),
                }),
            )
                .into_response()
        }
        Err(e) if e.to_string().contains("agencies_handle_key") => {
            // Transaction rolls back automatically on drop — profile update undone.
            (StatusCode::CONFLICT, "agency handle already taken").into_response()
        }
        Err(e) => {
            tracing::error!("create_agency insert: {e:#}");
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
        }
    }
}
