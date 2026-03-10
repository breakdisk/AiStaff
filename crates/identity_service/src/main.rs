use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use dotenvy::dotenv;
use sqlx::postgres::PgPoolOptions;
use tracing_subscriber::{fmt, EnvFilter};

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
        .with_state((svc, pool));

    let addr = "0.0.0.0:3001";
    tracing::info!("identity_service listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

// ── POST /identity/oauth-callback ─────────────────────────────────────────────
// Called by Next.js auth.ts jwt callback after any OAuth provider sign-in.

async fn oauth_callback(
    State((_, pool)): State<(Arc<StitchService>, sqlx::PgPool)>,
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

// ── POST /identity/connect-provider ──────────────────────────────────────────
// Called when an authenticated user links an additional OAuth provider.
// Payload must include `existing_profile_id`.

async fn connect_provider(
    State((_, pool)): State<(Arc<StitchService>, sqlx::PgPool)>,
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
