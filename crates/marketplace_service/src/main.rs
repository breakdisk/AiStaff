//! marketplace_service — deployment creation + escrow command consumer.
//! HTTP on :3002 | Kafka consumer on escrow.commands

mod escrow_consumer;
mod handlers;

use anyhow::Result;
use axum::{
    routing::{get, post},
    Router,
};
use axum::routing::put;
use common::kafka::producer::KafkaProducer;
use dotenvy::dotenv;
use handlers::AppState;
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{fmt, EnvFilter};

#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();
    fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .json()
        .init();

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let brokers = std::env::var("KAFKA_BROKERS").unwrap_or_else(|_| "localhost:9092".into());

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&db_url)
        .await?;

    sqlx::migrate!("../../migrations").run(&pool).await?;

    let producer = KafkaProducer::new(&brokers)?;

    let state = Arc::new(AppState {
        db: pool.clone(),
        producer,
    });

    let app = Router::new()
        .route("/health", get(handlers::health))
        .route("/deployments", post(handlers::create_deployment))
        .route("/deployments/{id}", get(handlers::get_deployment))
        .route(
            "/listings",
            get(handlers::list_listings).post(handlers::create_listing),
        )
        .route("/listings/{id}", get(handlers::get_listing))
        .route("/skill-tags", get(handlers::get_skill_tags))
        .route(
            "/talent-skills/{id}",
            get(handlers::get_talent_skills).put(handlers::put_talent_skills),
        )
        .route("/express-interest", post(handlers::express_interest))
        .route("/talent-skills/{id}/attest", post(handlers::attest_skills))
        .with_state(state)
        .layer(TraceLayer::new_for_http());

    let addr = "0.0.0.0:3002";
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("marketplace_service HTTP on {addr}");

    tokio::try_join!(
        escrow_consumer::run_escrow_consumer(pool, brokers),
        async move {
            axum::serve(listener, app)
                .await
                .map_err(anyhow::Error::from)
        },
    )?;

    Ok(())
}
