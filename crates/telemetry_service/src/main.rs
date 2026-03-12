mod consumer;
mod drift_detector;
mod handlers;

use anyhow::Result;
use axum::{routing::get, Router};
use common::kafka::consumer::KafkaConsumer;
use common::kafka::producer::KafkaProducer;
use consumer::TelemetryConsumer;
use dotenvy::dotenv;
use drift_detector::DriftDetector;
use sqlx::PgPool;
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
    let detector = DriftDetector::new(db.clone(), producer);

    let consumer = KafkaConsumer::new(
        &brokers,
        "telemetry-service",
        &[common::events::TOPIC_TELEMETRY_EVENTS],
    )?;

    // REST API runs alongside the Kafka consumer.
    let app = Router::new()
        .route("/health", get(handlers::health))
        .route(
            "/deployments/{id}/heartbeats",
            get(handlers::get_heartbeats),
        )
        .route("/deployments/{id}/drift", get(handlers::get_drift_events))
        .with_state(db)
        .layer(TraceLayer::new_for_http());

    let addr = "0.0.0.0:3007";
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("telemetry-service listening on {addr}");

    let kafka_task =
        tokio::spawn(async move { TelemetryConsumer::new(consumer, detector).run().await });
    let http_task = tokio::spawn(async move {
        axum::serve(listener, app)
            .await
            .map_err(anyhow::Error::from)
    });

    tokio::select! {
        r = kafka_task => r??,
        r = http_task  => r??,
    }
    Ok(())
}
