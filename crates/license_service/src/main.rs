mod handlers;
mod issuer;
mod validator;

use anyhow::Result;
use axum::{routing::get, routing::post, Router};
use common::kafka::producer::KafkaProducer;
use dotenvy::dotenv;
use issuer::LicenseIssuer;
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

    let db = PgPool::connect(&db_url).await?;
    let producer = KafkaProducer::new(&brokers)?;
    let svc = Arc::new(LicenseIssuer::new(db, producer));

    let app = Router::new()
        .route("/health", get(handlers::health))
        .route("/licenses/issue", post(handlers::issue_license))
        .route("/licenses/{id}", get(handlers::get_license))
        .route("/licenses/{id}/revoke", post(handlers::revoke_license))
        .route("/licenses/{id}/validate", get(handlers::validate_license))
        .with_state(svc)
        .layer(TraceLayer::new_for_http());

    let addr = "0.0.0.0:3004";
    tracing::info!("license-service listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
