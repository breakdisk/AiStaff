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
            "ReleaseEscrow" => match serde_json::from_value::<ReleaseEscrow>(envelope.payload) {
                Ok(ev) => {
                    if let Err(e) = process_release_escrow(&db, &ev).await {
                        error!("process_release_escrow: {e:#}");
                    }
                }
                Err(e) => warn!("Bad ReleaseEscrow payload: {e}"),
            },
            "EscrowRelease" => match serde_json::from_value::<EscrowRelease>(envelope.payload) {
                Ok(ev) => {
                    if let Err(e) = process_escrow_release(&db, &ev).await {
                        error!("process_escrow_release: {e:#}");
                    }
                }
                Err(e) => warn!("Bad EscrowRelease payload: {e}"),
            },
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

/// Handles the escrow release from VetoFirst payout service.
///
/// Freelancer path (agency_id = None):
///   1. Developer payout  (~59.5% — 70% of post-15%-commission remainder)
///   2. Talent payout     (~25.5% — 30% of post-15%-commission remainder)
///   3. Platform fee      (15% — recorded in platform_fees)
///
/// Agency path (agency_id = Some):
///   1. Developer payout  (70% of post-agency remainder)
///   2. Talent payout     (30% of post-agency remainder)
///   3. Agency management fee (agency_pct% of post-12%-commission remainder)
///   4. Platform fee      (12% — recorded in platform_fees)
///
/// All rows inserted atomically in one transaction.
async fn process_escrow_release(db: &PgPool, ev: &EscrowRelease) -> anyhow::Result<()> {
    let mut tx = db.begin().await?;

    // Developer payout
    sqlx::query(
        "INSERT INTO escrow_payouts (deployment_id, recipient_id, amount_cents, reason, created_at)
         VALUES ($1, $2, $3, 'developer_pct', NOW())",
    )
    .bind(ev.deployment_id)
    .bind(ev.developer_id)
    .bind(ev.developer_cents as i64)
    .execute(&mut *tx)
    .await?;

    // Talent payout
    sqlx::query(
        "INSERT INTO escrow_payouts (deployment_id, recipient_id, amount_cents, reason, created_at)
         VALUES ($1, $2, $3, 'talent_pct', NOW())",
    )
    .bind(ev.deployment_id)
    .bind(ev.talent_id)
    .bind(ev.talent_cents as i64)
    .execute(&mut *tx)
    .await?;

    // Agency management fee — Option B: platform distributes directly to agency owner
    if let Some(agency_id) = ev.agency_id {
        if ev.agency_cents > 0 {
            sqlx::query(
                "INSERT INTO escrow_payouts (deployment_id, recipient_id, amount_cents, reason, created_at)
                 VALUES ($1, $2, $3, 'agency_mgmt_fee', NOW())",
            )
            .bind(ev.deployment_id)
            .bind(agency_id)
            .bind(ev.agency_cents as i64)
            .execute(&mut *tx)
            .await?;
        }
    }

    // Platform commission — 12% for agency deployments, 15% for freelancer
    let fee_pct: i16 = if ev.agency_id.is_some() { 12 } else { 15 };
    sqlx::query(
        "INSERT INTO platform_fees (deployment_id, fee_cents, fee_pct, created_at)
         VALUES ($1, $2, $3, NOW())",
    )
    .bind(ev.deployment_id)
    .bind(ev.platform_cents as i64)
    .bind(fee_pct)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    info!(
        deployment_id  = %ev.deployment_id,
        platform_cents = ev.platform_cents,
        dev_cents      = ev.developer_cents,
        talent_cents   = ev.talent_cents,
        agency_cents   = ev.agency_cents,
        is_agency      = ev.agency_id.is_some(),
        "Escrow split recorded"
    );
    Ok(())
}
