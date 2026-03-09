mod checklist_consumer;
mod mcp_proxy;
mod sandbox;
mod success_trigger;

use dotenvy::dotenv;
use sqlx::postgres::PgPoolOptions;
use tracing_subscriber::{fmt, EnvFilter};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv().ok();
    fmt().with_env_filter(EnvFilter::from_default_env()).json().init();

    let db_url  = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let brokers = std::env::var("KAFKA_BROKERS").unwrap_or_else(|_| "localhost:9092".into());

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    let producer = common::kafka::producer::KafkaProducer::new(&brokers)?;

    tracing::info!("deployment_engine starting — SuccessTrigger + ChecklistConsumer");

    // Both consumers run concurrently on separate Kafka group IDs.
    // If either exits (Kafka disconnect), the engine process exits and restarts.
    tokio::try_join!(
        success_trigger::run_success_trigger(pool.clone(), producer.clone(), brokers.clone()),
        checklist_consumer::run_checklist_consumer(pool, producer, brokers),
    )?;

    Ok(())
}
