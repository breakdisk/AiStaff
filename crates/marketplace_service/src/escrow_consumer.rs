//! Consumes `escrow.commands` — processes ReleaseEscrow and EscrowRelease events.

use common::{
    events::{EscrowRelease, EventEnvelope, ReleaseEscrow, TOPIC_ESCROW_COMMANDS},
    kafka::consumer::KafkaConsumer,
};
use sqlx::PgPool;
use tracing::{error, info, warn};

pub async fn run_escrow_consumer(db: PgPool, brokers: String) -> anyhow::Result<()> {
    let consumer = KafkaConsumer::new(
        &brokers,
        "marketplace-escrow-consumer",
        &[TOPIC_ESCROW_COMMANDS],
    )?;

    info!("Escrow consumer running");

    loop {
        let Some((key, payload)) = consumer.next_payload().await else {
            error!("Escrow consumer terminated");
            break;
        };

        let envelope: EventEnvelope = match serde_json::from_str(&payload) {
            Ok(e) => e,
            Err(e) => {
                warn!(key, "Failed to parse EventEnvelope: {e}");
                continue;
            }
        };

        match envelope.event_type.as_str() {
            "ReleaseEscrow" => {
                match serde_json::from_value::<ReleaseEscrow>(envelope.payload) {
                    Ok(ev) => {
                        if let Err(e) = process_release_escrow(&db, &ev).await {
                            error!("process_release_escrow: {e:#}");
                        }
                    }
                    Err(e) => warn!("Bad ReleaseEscrow payload: {e}"),
                }
            }
            "EscrowRelease" => {
                match serde_json::from_value::<EscrowRelease>(envelope.payload) {
                    Ok(ev) => {
                        if let Err(e) = process_escrow_release(&db, &ev).await {
                            error!("process_escrow_release: {e:#}");
                        }
                    }
                    Err(e) => warn!("Bad EscrowRelease payload: {e}"),
                }
            }
            other => info!("Ignoring unknown escrow command: {other}"),
        }
    }

    Ok(())
}

/// Handles the legacy 30% freelancer release from SuccessTrigger.
async fn process_release_escrow(db: &PgPool, ev: &ReleaseEscrow) -> anyhow::Result<()> {
    sqlx::query!(
        "INSERT INTO escrow_payouts (deployment_id, recipient_id, amount_cents, reason, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT DO NOTHING",
        ev.deployment_id,
        ev.freelancer_id,
        ev.amount_cents as i64,
        ev.reason,
    )
    .execute(db)
    .await?;

    info!(deployment_id = %ev.deployment_id, cents = ev.amount_cents, "Escrow payout recorded");
    Ok(())
}

/// Handles the 70/30 split release from VetoFirst payout service.
async fn process_escrow_release(db: &PgPool, ev: &EscrowRelease) -> anyhow::Result<()> {
    // Insert two payout rows atomically
    let mut tx = db.begin().await?;

    sqlx::query!(
        "INSERT INTO escrow_payouts (deployment_id, recipient_id, amount_cents, reason, created_at)
         VALUES ($1, $2, $3, 'developer_70_pct', NOW())",
        ev.deployment_id,
        ev.developer_id,
        ev.developer_cents as i64,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query!(
        "INSERT INTO escrow_payouts (deployment_id, recipient_id, amount_cents, reason, created_at)
         VALUES ($1, $2, $3, 'talent_30_pct', NOW())",
        ev.deployment_id,
        ev.talent_id,
        ev.talent_cents as i64,
    )
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    info!(
        deployment_id = %ev.deployment_id,
        dev_cents = ev.developer_cents,
        talent_cents = ev.talent_cents,
        "70/30 escrow split recorded"
    );
    Ok(())
}
