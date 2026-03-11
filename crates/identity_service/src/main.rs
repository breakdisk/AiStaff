use std::sync::Arc;

use axum::{
    extract::{FromRef, Path, State},
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::{get, patch, post},
    Router,
};
use serde::Deserialize;
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
        .route(
            "/identity/biometric-callback",
            post(handlers::biometric_callback),
        )
        // New single-provider OAuth endpoints (migration 0016)
        .route("/identity/oauth-callback", post(oauth_callback))
        .route("/identity/connect-provider", post(connect_provider))
        // Freelancer profile update (migration 0017)
        .route("/profile/{id}", patch(update_profile))
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
