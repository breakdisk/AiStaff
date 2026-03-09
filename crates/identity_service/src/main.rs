use std::sync::Arc;

use axum::{
    routing::{get, post},
    Router,
};
use dotenvy::dotenv;
use sqlx::postgres::PgPoolOptions;
use tracing_subscriber::{fmt, EnvFilter};

mod handlers;
mod openid4vp;
mod stitch_logic;
mod trust_score;
mod zk_verifier;

use stitch_logic::{StitchConfig, StitchService};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv().ok();
    fmt().with_env_filter(EnvFilter::from_default_env()).json().init();

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
    let svc = Arc::new(StitchService::new(pool, config));

    let app = Router::new()
        .route("/health", get(handlers::health))
        .route("/identity/stitch", post(handlers::stitch_identity))
        .route("/identity/wallet-redirect", get(handlers::wallet_redirect))
        .route("/identity/biometric-callback", post(handlers::biometric_callback))
        .with_state(svc);

    let addr = "0.0.0.0:3001";
    tracing::info!("identity_service listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
