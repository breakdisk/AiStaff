mod checklist_consumer;
mod mcp_proxy;
mod sandbox;
mod success_trigger;

use dotenvy::dotenv;
use sqlx::postgres::PgPoolOptions;
use std::time::Duration;
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

    let producer = common::kafka::producer::KafkaProducer::new(&brokers)?;

    tracing::info!("deployment_engine starting — ChecklistConsumer (primary) + SuccessTrigger (secondary)");

    // SuccessTrigger handles the external-installer path (installation.events).
    // It is secondary: its failure must NOT kill the ChecklistConsumer.
    // Spawn it independently with auto-restart on error.
    {
        let pool_st    = pool.clone();
        let prod_st    = producer.clone();
        let brokers_st = brokers.clone();
        tokio::spawn(async move {
            loop {
                if let Err(e) = success_trigger::run_success_trigger(
                    pool_st.clone(),
                    prod_st.clone(),
                    brokers_st.clone(),
                )
                .await
                {
                    tracing::error!("SuccessTrigger exited with error: {e:#} — restarting in 5s");
                    tokio::time::sleep(Duration::from_secs(5)).await;
                }
            }
        });
    }

    // ChecklistConsumer is the primary path (DoD → Wasm sandbox → payout).
    // The process exits and lets the container orchestrator restart it on failure.
    checklist_consumer::run_checklist_consumer(pool, producer, brokers).await
}
