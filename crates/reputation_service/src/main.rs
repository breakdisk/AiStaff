mod handlers;
mod vc_issuer;

use anyhow::Result;
use axum::{routing::get, routing::post, Router};
use common::kafka::producer::KafkaProducer;
use dotenvy::dotenv;
use handlers::AppState;
use sqlx::PgPool;
use std::sync::Arc;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();
    tracing_subscriber::registry()
        .with(EnvFilter::from_default_env())
        .with(fmt::layer().json())
        .init();

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
    let brokers = std::env::var("KAFKA_BROKERS").expect("KAFKA_BROKERS");
    let platform_did =
        std::env::var("PLATFORM_DID").unwrap_or_else(|_| "did:aistaff:platform".into());

    let db = PgPool::connect(&db_url).await?;
    let producer = KafkaProducer::new(&brokers)?;
    let state = Arc::new(AppState {
        db,
        producer,
        platform_did,
    });

    let app = Router::new()
        .route("/health", get(handlers::health))
        .route("/reputation/:id/export", post(handlers::export_vc))
        .route("/reputation/:id/vc", get(handlers::get_vc))
        .with_state(state)
        .layer(TraceLayer::new_for_http());

    let addr = "0.0.0.0:3009";
    tracing::info!("reputation-service listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
