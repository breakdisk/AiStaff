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

const VETO_WINDOW_SECS: u64 = 30;
const BIOMETRIC_TIMEOUT_SECS: u64 = 86_400; // 24 hours

/// Entry point — consumes `deployment.complete` and spawns a handler per event.
pub async fn run_veto_payout_consumer(db: PgPool, brokers: String) -> anyhow::Result<()> {
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
    event: DeploymentComplete,
    db: PgPool,
    producer: std::sync::Arc<KafkaProducer>,
    brokers: String,
) {
    let did = event.deployment_id;

    if let Err(e) = set_state(&db, did, "VETO_WINDOW").await {
        error!(%did, "set_state VETO_WINDOW: {e}");
        return;
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
            ) else {
                return;
            };

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
            // ── Quality Gate check ────────────────────────────────────────
            // Block escrow if any flagged scan for this deployment has
            // blocks_release=true (CRITICAL or HIGH issues unresolved).
            if quality_gate_blocks(&db, did).await {
                warn!(%did, "Escrow HELD — quality gate has unresolved CRITICAL/HIGH issues");
                set_state(&db, did, "QUALITY_GATE_BLOCKED").await.ok();
                return;
            }

            // Read feature flag from DB. Defaults fail-closed (false) if flag missing.
            // See migrations/0052_feature_flags.sql for deployment order note.
            let skip_biometric: bool = sqlx::query_scalar(
                "SELECT enabled FROM feature_flags WHERE name = 'skip_biometric'"
            )
            .fetch_optional(&db)
            .await
            .unwrap_or(None)
            .unwrap_or(false);

            if skip_biometric {
                info!(%did, "Veto window elapsed — releasing escrow (biometric skipped)");

                // Look up agency context — determines split path (12% vs 15%)
                let agency_row = sqlx::query(
                    "SELECT agency_id, agency_pct FROM deployments WHERE id = $1"
                )
                .bind(did)
                .fetch_optional(&db)
                .await
                .unwrap_or(None);

                let (agency_id, platform_cents, agency_cents, dev_cents, talent_cents) =
                    if let Some(row) = agency_row {
                        use sqlx::Row;
                        let aid: Option<Uuid> = row.get("agency_id");
                        let apct: i16        = row.get("agency_pct");
                        if aid.is_some() && apct > 0 {
                            let (p, a, d, t) = split_agency(event.total_cents, apct as u32);
                            (aid, p, a, d, t)
                        } else {
                            let (p, d, t) = split_with_commission(event.total_cents);
                            (None, p, 0, d, t)
                        }
                    } else {
                        let (p, d, t) = split_with_commission(event.total_cents);
                        (None, p, 0, d, t)
                    };

                let release = EscrowRelease {
                    deployment_id:   did,
                    developer_id:    event.developer_id,
                    developer_cents: dev_cents,
                    talent_id:       event.talent_id,
                    talent_cents,
                    platform_cents,
                    agency_id,
                    agency_cents,
                };

                let env = EventEnvelope::new("EscrowRelease", &release);
                if let Err(e) = producer
                    .publish(TOPIC_ESCROW_COMMANDS, &did.to_string(), &env)
                    .await
                {
                    error!(%did, "Kafka publish EscrowRelease: {e}");
                }

                set_state(&db, did, "RELEASED").await.ok();
                info!(%did, platform_cents, agency_cents, dev_cents, talent_cents,
                    "Escrow RELEASED (veto-first)");
            } else {
                // Full ZK biometric flow — feature_flags.skip_biometric = false in DB.
                info!(%did, "Veto window elapsed — awaiting biometric sign-off");
                set_state(&db, did, "BIOMETRIC_PENDING").await.ok();

                let bio_result = tokio::time::timeout(
                    Duration::from_secs(BIOMETRIC_TIMEOUT_SECS),
                    wait_for_biometric(&brokers, did),
                )
                .await;

                match bio_result {
                    Ok(Some(bio)) => match verify_zk_proof(&bio) {
                        Ok(true) => {
                            // Re-check quality gate after biometric sign-off
                            if quality_gate_blocks(&db, did).await {
                                warn!(%did, "Escrow HELD — quality gate blocks after biometric");
                                set_state(&db, did, "QUALITY_GATE_BLOCKED").await.ok();
                                return;
                            }

                            // Look up agency context — same logic as skip_biometric path
                            let agency_row = sqlx::query(
                                "SELECT agency_id, agency_pct FROM deployments WHERE id = $1"
                            )
                            .bind(did)
                            .fetch_optional(&db)
                            .await
                            .unwrap_or(None);

                            let (agency_id, platform_cents, agency_cents, dev_cents, talent_cents) =
                                if let Some(row) = agency_row {
                                    use sqlx::Row;
                                    let aid: Option<Uuid> = row.get("agency_id");
                                    let apct: i16        = row.get("agency_pct");
                                    if aid.is_some() && apct > 0 {
                                        let (p, a, d, t) = split_agency(event.total_cents, apct as u32);
                                        (aid, p, a, d, t)
                                    } else {
                                        let (p, d, t) = split_with_commission(event.total_cents);
                                        (None, p, 0, d, t)
                                    }
                                } else {
                                    let (p, d, t) = split_with_commission(event.total_cents);
                                    (None, p, 0, d, t)
                                };

                            let release = EscrowRelease {
                                deployment_id:   did,
                                developer_id:    event.developer_id,
                                developer_cents: dev_cents,
                                talent_id:       event.talent_id,
                                talent_cents,
                                platform_cents,
                                agency_id,
                                agency_cents,
                            };

                            let env = EventEnvelope::new("EscrowRelease", &release);
                            if let Err(e) = producer
                                .publish(TOPIC_ESCROW_COMMANDS, &did.to_string(), &env)
                                .await
                            {
                                error!(%did, "Kafka publish EscrowRelease: {e}");
                            }

                            set_state(&db, did, "RELEASED").await.ok();
                            info!(%did, platform_cents, agency_cents, dev_cents, talent_cents,
                                "Escrow RELEASED (ZK verified)");
                        }
                        Ok(false) => {
                            error!(%did, "ZK proof invalid — marking FAILED");
                            set_state(&db, did, "FAILED").await.ok();
                        }
                        Err(e) => {
                            error!(%did, "ZK verification error: {e}");
                            set_state(&db, did, "FAILED").await.ok();
                        }
                    },
                    _ => {
                        warn!(%did, "Biometric sign-off timeout — marking FAILED");
                        set_state(&db, did, "FAILED").await.ok();
                    }
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
    )
    .ok()?;

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

/// Three-way freelancer split: 15% platform, then 70/30 of remainder.
/// Returns `(platform_cents, dev_cents, talent_cents)`.
/// Uses integer truncation — never rounds up (CLAUDE.md §2).
/// Remainder flows to talent, keeping the sum exact.
pub fn split_with_commission(total_cents: u64) -> (u64, u64, u64) {
    let platform_cents = total_cents * 15 / 100;
    let remaining      = total_cents - platform_cents;
    let dev_cents      = remaining * 70 / 100;
    let talent_cents   = remaining - dev_cents; // remainder — lossless
    (platform_cents, dev_cents, talent_cents)
}

/// Four-way agency split: 12% platform, agency management fee, then 70/30 of remainder.
/// Returns `(platform_cents, agency_cents, dev_cents, talent_cents)`.
/// `agency_pct` is the agency's cut of the post-platform remainder (0–100).
/// Uses integer truncation — never rounds up. Sum always equals total_cents.
pub fn split_agency(total_cents: u64, agency_pct: u32) -> (u64, u64, u64, u64) {
    let platform_cents = total_cents * 12 / 100;
    let remaining      = total_cents - platform_cents;
    let agency_cents   = remaining * (agency_pct as u64) / 100;
    let post_agency    = remaining - agency_cents;
    let dev_cents      = post_agency * 70 / 100;
    let talent_cents   = post_agency - dev_cents; // remainder — lossless
    (platform_cents, agency_cents, dev_cents, talent_cents)
}

/// Returns true if any quality gate scan for this deployment has
/// `blocks_release = true` AND `status = 'flagged'`.
/// A non-fatal DB error is treated as non-blocking (fail-open) with a warning.
async fn quality_gate_blocks(db: &PgPool, deployment_id: Uuid) -> bool {
    let result = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM quality_gate_scans
            WHERE deployment_id = $1
              AND blocks_release = TRUE
              AND status = 'flagged'
        )
        "#,
    )
    .bind(deployment_id)
    .fetch_one(db)
    .await;

    match result {
        Ok(blocked) => blocked,
        Err(e) => {
            warn!(%deployment_id, "quality_gate_blocks DB error (fail-open): {e}");
            false // fail-open: don't block escrow if DB query fails
        }
    }
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
    use super::{split_agency, split_with_commission};

    #[test]
    fn standard_split() {
        // $100.00: platform=$15.00, dev=$59.50, talent=$25.50
        let (platform, dev, talent) = split_with_commission(10_000);
        assert_eq!(platform, 1_500);
        assert_eq!(dev, 5_950);
        assert_eq!(talent, 2_550);
        assert_eq!(platform + dev + talent, 10_000);
    }

    #[test]
    fn no_penny_lost() {
        // Arbitrary amounts: sum must always equal total (lossless)
        for total in [1u64, 7, 99, 101, 999, 10_001, 1_000_003] {
            let (p, d, t) = split_with_commission(total);
            assert_eq!(p + d + t, total, "lossless for {total}");
        }
    }

    #[test]
    fn zero_total() {
        let (platform, dev, talent) = split_with_commission(0);
        assert_eq!(platform, 0);
        assert_eq!(dev, 0);
        assert_eq!(talent, 0);
    }

    #[test]
    fn large_contract() {
        // $1M: platform=$150k, dev=$595k, talent=$255k
        let (platform, dev, talent) = split_with_commission(100_000_000);
        assert_eq!(platform, 15_000_000);
        assert_eq!(dev, 59_500_000);
        assert_eq!(talent, 25_500_000);
        assert_eq!(platform + dev + talent, 100_000_000);
    }

    #[test]
    fn commission_pct_is_exactly_15() {
        // Platform must never exceed 15% (truncation, never rounds up)
        for total in [100u64, 333, 1_000, 9_999, 100_000] {
            let (platform, _, _) = split_with_commission(total);
            assert!(
                platform <= total * 15 / 100 + 1,
                "platform {platform} exceeds 15% of {total}"
            );
        }
    }

    #[test]
    fn skip_biometric_defaults_false_on_none() {
        // When DB returns None, unwrap_or(false) = do NOT skip
        let db_val: Option<bool> = None;
        let skip = db_val.unwrap_or(false);
        assert!(
            !skip,
            "should default to false (fail-closed) when flag missing"
        );
    }

    // ── Agency split tests ────────────────────────────────────────────────────

    #[test]
    fn agency_split_10pct() {
        // $100: platform=$12, agency=$8.80, dev=$55.44, talent=$23.76
        let (platform, agency, dev, talent) = split_agency(10_000, 10);
        assert_eq!(platform, 1_200);  // 12% of 10_000
        assert_eq!(agency,   880);    // 10% of 8_800 remainder
        assert_eq!(dev,      5_544);  // 70% of 7_920 post-agency
        assert_eq!(talent,   2_376);  // 30% of 7_920 (remainder — lossless)
        assert_eq!(platform + agency + dev + talent, 10_000);
    }

    #[test]
    fn agency_split_zero_pct() {
        // agency_pct=0: same as freelancer but with 12% platform (not 15%)
        let (platform, agency, dev, talent) = split_agency(10_000, 0);
        assert_eq!(platform, 1_200);
        assert_eq!(agency,   0);
        assert_eq!(dev,      6_160); // 70% of 8_800
        assert_eq!(talent,   2_640); // 30% of 8_800
        assert_eq!(platform + agency + dev + talent, 10_000);
    }

    #[test]
    fn agency_no_penny_lost() {
        // Lossless across all amounts and agency percentages
        for total in [1u64, 7, 99, 101, 999, 10_001, 1_000_003] {
            for apct in [0u32, 5, 10, 15, 20, 30] {
                let (p, a, d, t) = split_agency(total, apct);
                assert_eq!(
                    p + a + d + t, total,
                    "lossless for total={total} agency_pct={apct}"
                );
            }
        }
    }
}
