use crate::fanout::Fanout;
use anyhow::Result;
use common::events::EventEnvelope;
use common::kafka::consumer::KafkaConsumer;
use sqlx::Row;
use std::sync::Arc;

pub struct NotificationConsumer {
    consumer: KafkaConsumer,
    fanout:   Arc<Fanout>,
}

impl NotificationConsumer {
    pub fn new(consumer: KafkaConsumer, fanout: Arc<Fanout>) -> Self {
        Self { consumer, fanout }
    }

    pub async fn run(self) -> Result<()> {
        tracing::info!("notification consumer started");
        loop {
            let (key, payload) = match self.consumer.next_payload().await {
                Some(p) => p,
                None => break,
            };

            let envelope = match serde_json::from_str::<EventEnvelope>(&payload) {
                Ok(e) => e,
                Err(e) => {
                    tracing::warn!(key=%key, error=%e, "bad envelope");
                    continue;
                }
            };

            // Route events to human-readable notifications.
            match envelope.event_type.as_str() {
                "DriftDetected" => {
                    let deployment_id = envelope
                        .payload
                        .get("deployment_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown");
                    self.fanout
                        .dispatch_email(
                            uuid::Uuid::new_v4(), // platform sentinel; replace with real lookup
                            "ops@aistaff.app",
                            "Drift Alert",
                            &format!("Artifact drift detected for deployment {deployment_id}. Immediate review required."),
                        )
                        .await
                        .ok();
                }
                "ChecklistFinalized" => {
                    let all_passed = envelope
                        .payload
                        .get("all_passed")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    if !all_passed {
                        self.fanout
                            .dispatch_email(
                                uuid::Uuid::new_v4(),
                                "ops@aistaff.app",
                                "Installation Checklist Failed",
                                &format!(
                                    "Checklist failed for event {}. Check failed_steps for details.",
                                    envelope.event_id
                                ),
                            )
                            .await
                            .ok();
                    }
                }
                "LicenseIssued" => {
                    let license_id = envelope
                        .payload
                        .get("license_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown");
                    let jurisdiction = envelope
                        .payload
                        .get("jurisdiction")
                        .and_then(|v| v.as_str())
                        .unwrap_or("??");
                    let seats = envelope
                        .payload
                        .get("seats")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);

                    // Look up licensee email from unified_profiles.
                    let licensee_id_str = envelope
                        .payload
                        .get("licensee_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");

                    let row = sqlx::query(
                        "SELECT email FROM unified_profiles WHERE id = $1::uuid",
                    )
                    .bind(licensee_id_str)
                    .fetch_optional(&self.fanout.db)
                    .await
                    .ok()
                    .flatten();

                    let (recipient_id, to_addr) = if let Some(r) = row {
                        let email: String = r.get("email");
                        let rid = uuid::Uuid::parse_str(licensee_id_str)
                            .unwrap_or_else(|_| uuid::Uuid::new_v4());
                        (rid, email)
                    } else {
                        (uuid::Uuid::new_v4(), "ops@aistaff.app".to_string())
                    };

                    self.fanout
                        .dispatch_email(
                            recipient_id,
                            &to_addr,
                            "License Issued",
                            &format!(
                                "Your license {license_id} has been issued.\n\n\
                                 Jurisdiction: {jurisdiction}\n\
                                 Seats: {seats}\n\n\
                                 You may now deploy agents against this license."
                            ),
                        )
                        .await
                        .ok();
                }
                "LicenseRevoked" => {
                    let license_id = envelope
                        .payload
                        .get("license_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown");
                    let reason = envelope
                        .payload
                        .get("reason")
                        .and_then(|v| v.as_str())
                        .unwrap_or("no reason given");

                    self.fanout
                        .dispatch_email(
                            uuid::Uuid::new_v4(),
                            "ops@aistaff.app",
                            "License Revoked",
                            &format!("License {license_id} has been revoked. Reason: {reason}"),
                        )
                        .await
                        .ok();
                }
                "EnvironmentReady" => {
                    let deployment_id = envelope
                        .payload
                        .get("deployment_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown");

                    // Look up the freelancer assigned to this deployment.
                    let row = sqlx::query(
                        "SELECT freelancer_id FROM deployments WHERE id = $1::uuid",
                    )
                    .bind(deployment_id)
                    .fetch_optional(&self.fanout.db)
                    .await
                    .ok()
                    .flatten();

                    let (recipient_id, to_addr) = if let Some(r) = row {
                        let fid: uuid::Uuid = r.get("freelancer_id");
                        // In production: JOIN unified_profiles to get the real email.
                        // For now use the talent's UUID as the fallback address domain.
                        (fid, format!("talent-{}@aistaff.app", &fid.to_string()[..8]))
                    } else {
                        (uuid::Uuid::new_v4(), "ops@aistaff.app".to_string())
                    };

                    self.fanout
                        .dispatch_email(
                            recipient_id,
                            &to_addr,
                            "Environment Ready — Begin Installation",
                            &format!(
                                "The environment for deployment {deployment_id} has passed all \
                                 pre-flight checks and is ready for installation.\n\n\
                                 Run your AiTalent CLI to begin the DoD checklist."
                            ),
                        )
                        .await
                        .ok();
                }
                _ => {}
            }
        }
        Ok(())
    }
}
