mod handlers;
mod veto_payout;

use axum::{
    routing::{get, post},
    Router,
};
use common::kafka::producer::KafkaProducer;
use dotenvy::dotenv;
use handlers::AppState;
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{fmt, EnvFilter};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv().ok();
    fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .json()
        .init();

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let brokers = std::env::var("KAFKA_BROKERS").unwrap_or_else(|_| "localhost:9092".into());

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    let state = Arc::new(AppState {
        db: pool.clone(),
        producer: KafkaProducer::new(&brokers)?,
    });

    let app = Router::new()
        .route("/health", get(handlers::health))
        .route("/payouts/:deployment_id/veto", post(handlers::veto))
        .route("/payouts/:deployment_id/approve", post(handlers::approve))
        .with_state(state)
        .layer(TraceLayer::new_for_http());

    let addr = "0.0.0.0:3010";
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("payout_service HTTP on {addr}");

    tokio::try_join!(
        veto_payout::run_veto_payout_consumer(pool, brokers),
        async move {
            axum::serve(listener, app)
                .await
                .map_err(anyhow::Error::from)
        },
    )?;

    Ok(())
}
