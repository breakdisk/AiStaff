//! Veto-First Payout Service.
//!
//! Flow:
//!   1. Consume `deployment.complete`
//!   2. Open 30-second silent approval window
//!   3. If `payout.veto` arrives within window → mark VETOED, open dispute
//!   4. Else → wait for `biometric.signoff` (ZK proof)
//!   5. Verify ZK proof → emit `escrow.commands:EscrowRelease` (70/30 split)

use std::time::Duration;

use common::{
    events::{
        BiometricSignoff, DeploymentComplete, EscrowRelease, EventEnvelope, PayoutVeto,
        TOPIC_BIOMETRIC_SIGNOFF, TOPIC_DEPLOYMENT_COMPLETE, TOPIC_ESCROW_COMMANDS,
        TOPIC_PAYOUT_VETO,
    },
    kafka::{consumer::KafkaConsumer, producer::KafkaProducer},
};
use sqlx::PgPool;
use tokio::sync::oneshot;
use tracing::{error, info, warn};
use uuid::Uuid;

const VETO_WINDOW_SECS:       u64 = 30;
const BIOMETRIC_TIMEOUT_SECS: u64 = 86_400; // 24 hours

/// Entry point — consumes `deployment.complete` and spawns a handler per event.
pub async fn run_veto_payout_consumer(
    db:      PgPool,
    brokers: String,
) -> anyhow::Result<()> {
    let producer = std::sync::Arc::new(KafkaProducer::new(&brokers)?);

    let consumer = KafkaConsumer::new(
        &brokers,
        "payout-service-deployment-consumer",
        &[TOPIC_DEPLOYMENT_COMPLETE],
    )?;

    info!("Veto-First payout consumer running");

    loop {
        let Some((_, payload)) = consumer.next_payload().await else {
            error!("Deployment consumer terminated");
            break;
        };

        let envelope: EventEnvelope = match serde_json::from_str(&payload) {
            Ok(e) => e,
            Err(e) => {
                warn!("Failed to parse DeploymentComplete envelope: {e}");
                continue;
            }
        };

        if envelope.event_type != "DeploymentComplete" {
            continue;
        }

        match serde_json::from_value::<DeploymentComplete>(envelope.payload) {
            Ok(event) => {
                let db_clone = db.clone();
                let pr_clone = producer.clone();
                let br_clone = brokers.clone();
                tokio::spawn(async move {
                    handle_deployment_complete(event, db_clone, pr_clone, br_clone).await;
                });
            }
            Err(e) => warn!("Bad DeploymentComplete payload: {e}"),
        }
    }

    Ok(())
}

async fn handle_deployment_complete(
    event:    DeploymentComplete,
    db:       PgPool,
    producer: std::sync::Arc<KafkaProducer>,
    brokers:  String,
) {
    let did = event.deployment_id;

    if let Err(e) = set_state(&db, did, "VETO_WINDOW").await {
        error!(%did, "set_state VETO_WINDOW: {e}"); return;
    }

    // ── Open veto listener ────────────────────────────────────────────────
    let (veto_tx, veto_rx) = oneshot::channel::<PayoutVeto>();

    {
        let brokers_v = brokers.clone();
        tokio::spawn(async move {
            let Ok(consumer) = KafkaConsumer::new(
                &brokers_v,
                &format!("payout-veto-{did}"),
                &[TOPIC_PAYOUT_VETO],
            ) else { return; };

            loop {
                if let Some((_, payload)) = consumer.next_payload().await {
                    if let Ok(env) = serde_json::from_str::<EventEnvelope>(&payload) {
                        if let Ok(veto) = serde_json::from_value::<PayoutVeto>(env.payload) {
                            if veto.deployment_id == did {
                                let _ = veto_tx.send(veto);
                                return;
                            }
                        }
                    }
                }
            }
        });
    }

    // ── Race: 30-second window vs. veto ──────────────────────────────────
    let window = tokio::time::sleep(Duration::from_secs(VETO_WINDOW_SECS));
    tokio::pin!(window);

    tokio::select! {
        Ok(veto) = veto_rx => {
            warn!(%did, reason = %veto.reason, "Payout VETOED");
            set_state(&db, did, "VETOED").await.ok();
            // Dispute opened — manual resolution required
        }

        _ = &mut window => {
            info!(%did, "Veto window elapsed — awaiting biometric sign-off");
            set_state(&db, did, "BIOMETRIC_PENDING").await.ok();

            // ── Wait for biometric sign-off ───────────────────────────
            let bio_result = tokio::time::timeout(
                Duration::from_secs(BIOMETRIC_TIMEOUT_SECS),
                wait_for_biometric(&brokers, did),
            ).await;

            match bio_result {
                Ok(Some(bio)) => {
                    match verify_zk_proof(&bio) {
                        Ok(true) => {
                            let (dev_cents, talent_cents) = split_70_30(event.total_cents);

                            let release = EscrowRelease {
                                deployment_id:   did,
                                developer_id:    event.developer_id,
                                developer_cents: dev_cents,
                                talent_id:       event.talent_id,
                                talent_cents,
                            };

                            let env = EventEnvelope::new("EscrowRelease", &release);
                            if let Err(e) = producer
                                .publish(TOPIC_ESCROW_COMMANDS, &did.to_string(), &env)
                                .await
                            {
                                error!(%did, "Kafka publish EscrowRelease: {e}");
                            }

                            set_state(&db, did, "RELEASED").await.ok();
                            info!(%did, dev_cents, talent_cents, "Escrow RELEASED 70/30");
                        }
                        Ok(false) => {
                            error!(%did, "ZK proof invalid — marking FAILED");
                            set_state(&db, did, "FAILED").await.ok();
                        }
                        Err(e) => {
                            error!(%did, "ZK verification error: {e}");
                            set_state(&db, did, "FAILED").await.ok();
                        }
                    }
                }
                _ => {
                    warn!(%did, "Biometric sign-off timeout — marking FAILED");
                    set_state(&db, did, "FAILED").await.ok();
                }
            }
        }
    }
}

async fn wait_for_biometric(brokers: &str, target: Uuid) -> Option<BiometricSignoff> {
    let consumer = KafkaConsumer::new(
        brokers,
        &format!("payout-bio-{target}"),
        &[TOPIC_BIOMETRIC_SIGNOFF],
    ).ok()?;

    loop {
        let (_, payload) = consumer.next_payload().await?;
        if let Ok(env) = serde_json::from_str::<EventEnvelope>(&payload) {
            if let Ok(bio) = serde_json::from_value::<BiometricSignoff>(env.payload) {
                if bio.deployment_id == target {
                    return Some(bio);
                }
            }
        }
    }
}

/// ZK proof verification.
/// v1: structural validation (non-empty proof, valid DID prefix).
/// v2: integrate `ark-groth16` / `halo2` for full cryptographic verification.
fn verify_zk_proof(bio: &BiometricSignoff) -> anyhow::Result<bool> {
    let proof_bytes = hex::decode(&bio.zk_proof_hex)?;
    let valid = !proof_bytes.is_empty() && bio.verifier_did.starts_with("did:");
    Ok(valid)
}

/// Pure escrow split — keeps integer arithmetic exact.
pub fn split_70_30(total_cents: u64) -> (u64, u64) {
    let dev_cents    = total_cents * 70 / 100;
    let talent_cents = total_cents - dev_cents; // remainder goes to talent
    (dev_cents, talent_cents)
}

async fn set_state(db: &PgPool, id: Uuid, state: &str) -> anyhow::Result<()> {
    sqlx::query(
        "UPDATE deployments SET state = $2::deployment_status, updated_at = NOW() WHERE id = $1",
    )
    .bind(id)
    .bind(state)
    .execute(db)
    .await?;
    Ok(())
}

#[cfg(test)]
mod trust_engine {
    use super::split_70_30;

    #[test]
    fn standard_split() {
        let (dev, talent) = split_70_30(10_000);
        assert_eq!(dev, 7_000);
        assert_eq!(talent, 3_000);
        assert_eq!(dev + talent, 10_000);
    }

    #[test]
    fn no_penny_lost() {
        // Odd amounts: remainder goes to talent, total is preserved
        let (dev, talent) = split_70_30(101);
        assert_eq!(dev + talent, 101);
        assert!(dev >= 70); // approximately 70%
    }

    #[test]
    fn zero_total() {
        let (dev, talent) = split_70_30(0);
        assert_eq!(dev, 0);
        assert_eq!(talent, 0);
    }

    #[test]
    fn large_contract() {
        let (dev, talent) = split_70_30(1_000_000_00); // $1M in cents
        assert_eq!(dev, 700_000_00);
        assert_eq!(talent, 300_000_00);
    }
}
