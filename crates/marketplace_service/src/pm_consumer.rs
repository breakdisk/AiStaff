//! AI PM event consumer — reacts to ScopeDriftDetected by inserting an
//! inline system warning message into the deployment chat.
//!
//! The warning appears as a first-class message in collab_messages with
//! message_type = 'scope_warning'.  The frontend renders it as a card with
//! a "Raise Change Request" action button.

use anyhow::Result;
use common::{
    events::{EventEnvelope, ScopeDriftDetected, TOPIC_PM_EVENTS},
    kafka::consumer::KafkaConsumer,
};
use sqlx::PgPool;
use tracing::{error, info, warn};
use uuid::Uuid;

/// Sentinel UUID for the AI PM system profile (inserted in migration 0062).
const AI_PM_ID: &str = "00000000-0000-0000-0000-000000000001";

pub async fn run_pm_event_consumer(db: PgPool, brokers: String) -> Result<()> {
    let consumer = KafkaConsumer::new(
        &brokers,
        "marketplace-pm-events",
        &[TOPIC_PM_EVENTS],
    )?;

    info!("Marketplace PM event consumer running on {TOPIC_PM_EVENTS}");

    loop {
        let Some((key, payload)) = consumer.next_payload().await else {
            error!("Marketplace PM consumer Kafka stream ended");
            break;
        };

        let envelope: EventEnvelope = match serde_json::from_str(&payload) {
            Ok(e) => e,
            Err(e) => {
                warn!(key, "PM event consumer: bad EventEnvelope: {e}");
                continue;
            }
        };

        match envelope.event_type.as_str() {
            "ScopeDriftDetected" => {
                let ev: ScopeDriftDetected =
                    match serde_json::from_value(envelope.payload) {
                        Ok(e) => e,
                        Err(e) => {
                            warn!("Bad ScopeDriftDetected payload: {e}");
                            continue;
                        }
                    };
                if let Err(e) = handle_scope_drift(&db, ev).await {
                    error!("handle_scope_drift: {e:#}");
                }
            }
            other => {
                // Forward-compatible: ignore unknown PM event types.
                info!("PM consumer: ignoring unknown event type '{other}'");
            }
        }
    }

    Ok(())
}

async fn handle_scope_drift(db: &PgPool, ev: ScopeDriftDetected) -> Result<()> {
    let ai_pm_id = Uuid::parse_str(AI_PM_ID)?;

    let body = format!(
        "⚠️ Scope Alert: {}",
        ev.summary
    );

    let metadata = serde_json::json!({
        "trigger_message_id": ev.trigger_message_id,
        "summary":            ev.summary,
        "confidence":         ev.confidence,
    });

    sqlx::query(
        "INSERT INTO collab_messages
             (deployment_id, sender_id, sender_name, body, message_type, metadata)
         VALUES ($1, $2, 'AI Project Manager', $3, 'scope_warning', $4)",
    )
    .bind(ev.deployment_id)
    .bind(ai_pm_id)
    .bind(&body)
    .bind(&metadata)
    .execute(db)
    .await?;

    info!(
        deployment_id = %ev.deployment_id,
        trigger       = %ev.trigger_message_id,
        "Scope warning system message inserted into chat"
    );

    Ok(())
}
