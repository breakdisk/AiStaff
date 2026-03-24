use crate::fanout::Fanout;
use anyhow::Result;
use common::events::EventEnvelope;
use common::kafka::consumer::KafkaConsumer;
use sqlx::Row;
use std::sync::Arc;

pub struct NotificationConsumer {
    consumer: KafkaConsumer,
    fanout: Arc<Fanout>,
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
                // ─────────────────────────────────────────────────────────────
                // Existing handlers (preserved exactly)
                // ─────────────────────────────────────────────────────────────
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

                    let row = sqlx::query("SELECT email FROM unified_profiles WHERE id = $1::uuid")
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
                    let row =
                        sqlx::query("SELECT freelancer_id FROM deployments WHERE id = $1::uuid")
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

                // ─────────────────────────────────────────────────────────────
                // New handlers
                // ─────────────────────────────────────────────────────────────
                "EscrowRelease" => {
                    let developer_id_str = envelope
                        .payload
                        .get("developer_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let talent_id_str = envelope
                        .payload
                        .get("talent_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let developer_cents = envelope
                        .payload
                        .get("developer_cents")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    let talent_cents = envelope
                        .payload
                        .get("talent_cents")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);

                    // Look up developer email.
                    let dev_row =
                        sqlx::query("SELECT email FROM unified_profiles WHERE id = $1::uuid")
                            .bind(developer_id_str)
                            .fetch_optional(&self.fanout.db)
                            .await
                            .ok()
                            .flatten();

                    let (dev_id, dev_email) = if let Some(r) = dev_row {
                        let email: String = r.get("email");
                        let id = uuid::Uuid::parse_str(developer_id_str)
                            .unwrap_or_else(|_| uuid::Uuid::new_v4());
                        (id, email)
                    } else {
                        (uuid::Uuid::new_v4(), "ops@aistaff.app".to_string())
                    };

                    // Look up talent email.
                    let talent_row =
                        sqlx::query("SELECT email FROM unified_profiles WHERE id = $1::uuid")
                            .bind(talent_id_str)
                            .fetch_optional(&self.fanout.db)
                            .await
                            .ok()
                            .flatten();

                    let (talent_id, talent_email) = if let Some(r) = talent_row {
                        let email: String = r.get("email");
                        let id = uuid::Uuid::parse_str(talent_id_str)
                            .unwrap_or_else(|_| uuid::Uuid::new_v4());
                        (id, email)
                    } else {
                        (uuid::Uuid::new_v4(), "ops@aistaff.app".to_string())
                    };

                    let dev_usd = developer_cents / 100;
                    let talent_usd = talent_cents / 100;

                    self.fanout
                        .dispatch_email(
                            dev_id,
                            &dev_email,
                            "Escrow Released",
                            &format!(
                                "Your escrow payout of ${dev_usd} USD has been credited to your account."
                            ),
                        )
                        .await
                        .ok();

                    self.fanout
                        .dispatch_email(
                            talent_id,
                            &talent_email,
                            "Escrow Released",
                            &format!(
                                "Your escrow payout of ${talent_usd} USD has been credited to your account."
                            ),
                        )
                        .await
                        .ok();

                    self.fanout
                        .dispatch_in_app(
                            dev_id,
                            "Escrow Released",
                            &format!("${dev_usd} USD credited to your account."),
                            "EscrowRelease",
                            "normal",
                        )
                        .await
                        .ok();

                    self.fanout
                        .dispatch_in_app(
                            talent_id,
                            "Escrow Released",
                            &format!("${talent_usd} USD credited to your account."),
                            "EscrowRelease",
                            "normal",
                        )
                        .await
                        .ok();
                }

                "PayoutVeto" => {
                    let talent_id_str = envelope
                        .payload
                        .get("talent_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let reason = envelope
                        .payload
                        .get("reason")
                        .and_then(|v| v.as_str())
                        .unwrap_or("no reason provided");

                    let talent_row =
                        sqlx::query("SELECT email FROM unified_profiles WHERE id = $1::uuid")
                            .bind(talent_id_str)
                            .fetch_optional(&self.fanout.db)
                            .await
                            .ok()
                            .flatten();

                    let (talent_id, talent_email) = if let Some(r) = talent_row {
                        let email: String = r.get("email");
                        let id = uuid::Uuid::parse_str(talent_id_str)
                            .unwrap_or_else(|_| uuid::Uuid::new_v4());
                        (id, email)
                    } else {
                        (uuid::Uuid::new_v4(), "ops@aistaff.app".to_string())
                    };

                    self.fanout
                        .dispatch_email(
                            talent_id,
                            &talent_email,
                            "Payout Vetoed",
                            &format!(
                                "Your payout has been vetoed and placed on hold.\n\nReason: {reason}\n\n\
                                 Please contact support if you believe this is an error."
                            ),
                        )
                        .await
                        .ok();

                    self.fanout
                        .dispatch_in_app(
                            talent_id,
                            "Payout Vetoed",
                            &format!("Your payout is on hold. Reason: {reason}"),
                            "PayoutVeto",
                            "high",
                        )
                        .await
                        .ok();
                }

                "MatchResult" => {
                    let request_id_str = envelope
                        .payload
                        .get("request_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");

                    // Look up the requester from match_requests.
                    let req_row =
                        sqlx::query("SELECT requester_id FROM match_requests WHERE id = $1::uuid")
                            .bind(request_id_str)
                            .fetch_optional(&self.fanout.db)
                            .await
                            .ok()
                            .flatten();

                    let (requester_id, requester_email) = if let Some(r) = req_row {
                        let rid: uuid::Uuid = r.get("requester_id");
                        let email_row =
                            sqlx::query("SELECT email FROM unified_profiles WHERE id = $1")
                                .bind(rid)
                                .fetch_optional(&self.fanout.db)
                                .await
                                .ok()
                                .flatten();

                        let email = email_row
                            .map(|er| er.try_get::<String, _>("email").unwrap_or_default())
                            .unwrap_or_else(|| "ops@aistaff.app".to_string());

                        (rid, email)
                    } else {
                        (uuid::Uuid::new_v4(), "ops@aistaff.app".to_string())
                    };

                    self.fanout
                        .dispatch_email(
                            requester_id,
                            &requester_email,
                            "New Talent Match Available",
                            "A new talent match result is available for your request. \
                             Log in to AiStaff to review your matches.",
                        )
                        .await
                        .ok();

                    self.fanout
                        .dispatch_in_app(
                            requester_id,
                            "New Talent Match",
                            "A new match result is available for your request.",
                            "MatchResult",
                            "normal",
                        )
                        .await
                        .ok();
                }

                "WarrantyClaimed" => {
                    let claim_id = envelope
                        .payload
                        .get("claim_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown");
                    let deployment_id_str = envelope
                        .payload
                        .get("deployment_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let claimant_id_str = envelope
                        .payload
                        .get("claimant_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");

                    // Look up claimant email.
                    let claimant_row =
                        sqlx::query("SELECT email FROM unified_profiles WHERE id = $1::uuid")
                            .bind(claimant_id_str)
                            .fetch_optional(&self.fanout.db)
                            .await
                            .ok()
                            .flatten();

                    let (claimant_id, claimant_email) = if let Some(r) = claimant_row {
                        let email: String = r.get("email");
                        let id = uuid::Uuid::parse_str(claimant_id_str)
                            .unwrap_or_else(|_| uuid::Uuid::new_v4());
                        (id, email)
                    } else {
                        (uuid::Uuid::new_v4(), "ops@aistaff.app".to_string())
                    };

                    // Look up developer via deployments + unified_profiles.
                    let dev_row = sqlx::query(
                        "SELECT up.email, d.developer_id
                         FROM deployments d
                         JOIN unified_profiles up ON up.id = d.developer_id
                         WHERE d.id = $1::uuid",
                    )
                    .bind(deployment_id_str)
                    .fetch_optional(&self.fanout.db)
                    .await
                    .ok()
                    .flatten();

                    let (developer_id, developer_email) = if let Some(r) = dev_row {
                        let email: String = r.get("email");
                        let id: uuid::Uuid = r.get("developer_id");
                        (id, email)
                    } else {
                        (uuid::Uuid::new_v4(), "ops@aistaff.app".to_string())
                    };

                    let claimant_body = format!(
                        "Your warranty claim {claim_id} has been filed for deployment {deployment_id_str}. \
                         You will be notified when it is resolved."
                    );
                    let developer_body = format!(
                        "A warranty claim {claim_id} has been raised against your deployment {deployment_id_str}. \
                         Please review within 7 days or a refund will be issued."
                    );

                    self.fanout
                        .dispatch_email(
                            claimant_id,
                            &claimant_email,
                            "Warranty Claim Filed",
                            &claimant_body,
                        )
                        .await
                        .ok();

                    self.fanout
                        .dispatch_email(
                            developer_id,
                            &developer_email,
                            "Warranty Claim Raised Against Your Deployment",
                            &developer_body,
                        )
                        .await
                        .ok();

                    self.fanout
                        .dispatch_in_app(
                            claimant_id,
                            "Warranty Claim Filed",
                            &format!("Claim {claim_id} filed. Awaiting resolution."),
                            "WarrantyClaimed",
                            "normal",
                        )
                        .await
                        .ok();

                    self.fanout
                        .dispatch_in_app(
                            developer_id,
                            "Warranty Claim Received",
                            &format!("Claim {claim_id} on deployment {deployment_id_str} requires your attention."),
                            "WarrantyClaimed",
                            "high",
                        )
                        .await
                        .ok();
                }

                "MentorshipPaired" => {
                    let mentor_id_str = envelope
                        .payload
                        .get("mentor_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let mentee_id_str = envelope
                        .payload
                        .get("mentee_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");

                    // Look up mentor email.
                    let mentor_row =
                        sqlx::query("SELECT email FROM unified_profiles WHERE id = $1::uuid")
                            .bind(mentor_id_str)
                            .fetch_optional(&self.fanout.db)
                            .await
                            .ok()
                            .flatten();

                    let (mentor_id, mentor_email) = if let Some(r) = mentor_row {
                        let email: String = r.get("email");
                        let id = uuid::Uuid::parse_str(mentor_id_str)
                            .unwrap_or_else(|_| uuid::Uuid::new_v4());
                        (id, email)
                    } else {
                        (uuid::Uuid::new_v4(), "ops@aistaff.app".to_string())
                    };

                    // Look up mentee email.
                    let mentee_row =
                        sqlx::query("SELECT email FROM unified_profiles WHERE id = $1::uuid")
                            .bind(mentee_id_str)
                            .fetch_optional(&self.fanout.db)
                            .await
                            .ok()
                            .flatten();

                    let (mentee_id, mentee_email) = if let Some(r) = mentee_row {
                        let email: String = r.get("email");
                        let id = uuid::Uuid::parse_str(mentee_id_str)
                            .unwrap_or_else(|_| uuid::Uuid::new_v4());
                        (id, email)
                    } else {
                        (uuid::Uuid::new_v4(), "ops@aistaff.app".to_string())
                    };

                    self.fanout
                        .dispatch_email(
                            mentee_id,
                            &mentee_email,
                            "You've been matched with a mentor",
                            "Great news — you have been paired with a mentor on AiStaff. \
                             Log in to view your mentor's profile and schedule your first session.",
                        )
                        .await
                        .ok();

                    self.fanout
                        .dispatch_email(
                            mentor_id,
                            &mentor_email,
                            "A new mentee has been assigned to you",
                            "A new mentee has been matched to you on AiStaff. \
                             Log in to review their profile and reach out to get started.",
                        )
                        .await
                        .ok();

                    self.fanout
                        .dispatch_in_app(
                            mentee_id,
                            "Mentor Matched",
                            "You have been paired with a mentor. Check your profile to connect.",
                            "MentorshipPaired",
                            "normal",
                        )
                        .await
                        .ok();

                    self.fanout
                        .dispatch_in_app(
                            mentor_id,
                            "New Mentee Assigned",
                            "A new mentee has been assigned to you. Check your profile to connect.",
                            "MentorshipPaired",
                            "normal",
                        )
                        .await
                        .ok();
                }

                // ─────────────────────────────────────────────────────────────
                // Async collab: new chat message → email each recipient
                // ─────────────────────────────────────────────────────────────
                "MessageSent" => {
                    let sender_name = envelope
                        .payload
                        .get("sender_name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("A team member");

                    let preview = envelope
                        .payload
                        .get("body_preview")
                        .and_then(|v| v.as_str())
                        .unwrap_or("(no preview)");

                    let deployment_id = envelope
                        .payload
                        .get("deployment_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown");

                    let recipient_ids = envelope
                        .payload
                        .get("recipient_ids")
                        .and_then(|v| v.as_array())
                        .cloned()
                        .unwrap_or_default();

                    for rid in recipient_ids {
                        let Some(rid_str) = rid.as_str() else {
                            continue;
                        };
                        let Ok(rid_uuid) = uuid::Uuid::parse_str(rid_str) else {
                            continue;
                        };

                        // Look up recipient email from unified_profiles
                        let email_row =
                            sqlx::query("SELECT email FROM unified_profiles WHERE id = $1")
                                .bind(rid_uuid)
                                .fetch_optional(&self.fanout.db)
                                .await;

                        let email = match email_row {
                            Ok(Some(r)) => r.try_get::<String, _>("email").unwrap_or_default(),
                            _ => continue,
                        };

                        if email.is_empty() {
                            continue;
                        }

                        let subject = format!("New message from {sender_name}");
                        let body = format!(
                            "{sender_name} sent you a message on engagement {deployment_id}:\n\n\
                             \"{preview}\"\n\n\
                             Reply at https://aistaffglobal.com/collab?deployment_id={deployment_id}",
                        );

                        self.fanout
                            .dispatch_email(rid_uuid, &email, &subject, &body)
                            .await
                            .ok();
                    }
                }

                "DeploymentStarted" => {
                    let deployment_id_str = envelope
                        .payload
                        .get("deployment_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let freelancer_id_str = envelope
                        .payload
                        .get("freelancer_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");

                    let Ok(freelancer_id) = uuid::Uuid::parse_str(freelancer_id_str) else {
                        tracing::warn!(
                            freelancer_id_str,
                            "DeploymentStarted: invalid freelancer_id"
                        );
                        continue;
                    };

                    if deployment_id_str.is_empty() {
                        tracing::warn!("DeploymentStarted: missing deployment_id in payload");
                        continue;
                    }

                    let steps = match sqlx::query(
                        "SELECT step_label FROM dod_checklist_steps WHERE deployment_id = $1::uuid",
                    )
                    .bind(deployment_id_str)
                    .fetch_all(&self.fanout.db)
                    .await
                    {
                        Ok(rows) => rows,
                        Err(e) => {
                            tracing::error!(
                                deployment_id = deployment_id_str,
                                "failed to fetch checklist steps: {e}"
                            );
                            continue;
                        }
                    };

                    let count = steps.len();
                    for step in &steps {
                        let Ok(step_label) = step.try_get::<String, _>("step_label") else {
                            continue;
                        };
                        if let Err(e) = sqlx::query(
                            "INSERT INTO reminders (user_id, deployment_id, title, remind_at, source)
                             VALUES ($1, $2::uuid, $3, NOW() + INTERVAL '24 hours', 'system')",
                        )
                        .bind(freelancer_id)
                        .bind(deployment_id_str)
                        .bind(format!("DoD: {step_label}"))
                        .execute(&self.fanout.db)
                        .await
                        {
                            tracing::error!("reminder insert error: {e}");
                        }
                    }
                    tracing::info!(
                        deployment_id = deployment_id_str,
                        count,
                        "system reminders seeded"
                    );
                }

                _ => {}
            }
        }
        Ok(())
    }
}
