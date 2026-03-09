mod checks;
mod consumer;

use anyhow::Result;
use common::kafka::consumer::KafkaConsumer;
use common::kafka::producer::KafkaProducer;
use consumer::OrchestratorConsumer;
use dotenvy::dotenv;
use sqlx::PgPool;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();
    tracing_subscriber::registry()
        .with(EnvFilter::from_default_env())
        .with(fmt::layer().json())
        .init();

    let db_url      = std::env::var("DATABASE_URL").expect("DATABASE_URL");
    let brokers     = std::env::var("KAFKA_BROKERS").expect("KAFKA_BROKERS");
    let group_id    = "environment-orchestrator";

    let db       = PgPool::connect(&db_url).await?;
    let producer = KafkaProducer::new(&brokers)?;
    let consumer = KafkaConsumer::new(
        &brokers,
        group_id,
        &[common::events::TOPIC_DEPLOYMENT_STARTED],
    )?;

    let orchestrator = OrchestratorConsumer::new(consumer, producer, db);
    orchestrator.run().await
}
