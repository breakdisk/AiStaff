mod checklist;
mod handlers;

use anyhow::Result;
use axum::{routing::get, routing::post, Router};
use checklist::ChecklistService;
use common::kafka::producer::KafkaProducer;
use dotenvy::dotenv;
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
    let svc = Arc::new(ChecklistService::new(db, producer));

    let app = Router::new()
        .route("/health", get(handlers::health))
        .route(
            "/checklist/{deployment_id}/step",
            post(handlers::record_step),
        )
        .route("/checklist/{deployment_id}/steps", get(handlers::get_steps))
        .route(
            "/checklist/{deployment_id}/summary",
            get(handlers::get_summary),
        )
        .with_state(svc)
        .layer(TraceLayer::new_for_http());

    let addr = "0.0.0.0:3003";
    tracing::info!("checklist-service listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
