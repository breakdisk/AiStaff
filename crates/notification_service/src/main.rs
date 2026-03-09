mod consumer;
mod fanout;

use anyhow::Result;
use consumer::NotificationConsumer;
use dotenvy::dotenv;
use fanout::Fanout;
use lettre::{AsyncSmtpTransport, Tokio1Executor};
use sqlx::PgPool;
use std::sync::Arc;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();
    tracing_subscriber::registry()
        .with(EnvFilter::from_default_env())
        .with(fmt::layer().json())
        .init();

    let db_url    = std::env::var("DATABASE_URL").expect("DATABASE_URL");
    let brokers   = std::env::var("KAFKA_BROKERS").expect("KAFKA_BROKERS");
    let smtp_host = std::env::var("SMTP_HOST").expect("SMTP_HOST");
    let smtp_from = std::env::var("SMTP_FROM").unwrap_or_else(|_| "noreply@aistaff.app".into());

    let db   = PgPool::connect(&db_url).await?;
    let smtp = AsyncSmtpTransport::<Tokio1Executor>::relay(&smtp_host)?.build();
    let fanout = Arc::new(Fanout::new(db, smtp, smtp_from));

    let consumer = common::kafka::consumer::KafkaConsumer::new(
        &brokers,
        "notification-service",
        &[
            common::events::TOPIC_DRIFT_ALERTS,
            common::events::TOPIC_CHECKLIST_EVENTS,
            common::events::TOPIC_LICENSE_COMMANDS,
            common::events::TOPIC_DEPLOYMENT_STATUS,
        ],
    )?;

    let nc = NotificationConsumer::new(consumer, fanout);
    nc.run().await
}
