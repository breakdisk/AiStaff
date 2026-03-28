use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ── Topic constants ───────────────────────────────────────────────────────────
pub const TOPIC_INSTALLATION_EVENTS: &str = "installation.events";
pub const TOPIC_ESCROW_COMMANDS: &str = "escrow.commands";
pub const TOPIC_DEPLOYMENT_STATUS: &str = "deployment.status";
pub const TOPIC_DEPLOYMENT_STARTED: &str = "deployment.started";
pub const TOPIC_DEPLOYMENT_COMPLETE: &str = "deployment.complete";
pub const TOPIC_PAYOUT_VETO: &str = "payout.veto";
pub const TOPIC_BIOMETRIC_SIGNOFF: &str = "biometric.signoff";

// ── Envelope ─────────────────────────────────────────────────────────────────
/// Top-level Kafka message wrapper — typed by `event_type`.
#[derive(Debug, Serialize, Deserialize)]
pub struct EventEnvelope {
    pub event_id: Uuid,
    pub event_type: String,
    pub occurred_at: DateTime<Utc>,
    pub payload: serde_json::Value,
}

impl EventEnvelope {
    pub fn new<T: Serialize>(event_type: &str, payload: &T) -> Self {
        Self {
            event_id: Uuid::new_v4(),
            event_type: event_type.to_string(),
            occurred_at: Utc::now(),
            payload: serde_json::to_value(payload).expect("payload must be serializable"),
        }
    }
}

// ── Deployment / installation events ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize)]
pub struct DeploymentStarted {
    pub deployment_id: Uuid,
    pub agent_id: Uuid,
    pub client_id: Uuid,
    pub freelancer_id: Uuid,
}

/// Emitted by the AiTalent worker tooling after successful install.
#[derive(Debug, Serialize, Deserialize)]
pub struct InstallationCompleted {
    pub deployment_id: Uuid,
    pub freelancer_id: Uuid,
    /// SHA-256 hex of the deployed Wasm artifact — deterministic proof of correct install.
    pub artifact_hash: String,
    pub completed_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InstallationFailed {
    pub deployment_id: Uuid,
    pub reason: String,
}

/// Emitted after sandbox is provisioned; triggers the Veto-First payout window.
#[derive(Debug, Serialize, Deserialize)]
pub struct DeploymentComplete {
    pub deployment_id: Uuid,
    pub developer_id: Uuid,
    pub talent_id: Uuid,
    pub total_cents: u64,
    pub artifact_hash: String,
}

// ── Payout / escrow events ────────────────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize)]
pub struct PayoutVeto {
    pub deployment_id: Uuid,
    pub talent_id: Uuid,
    pub reason: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BiometricSignoff {
    pub deployment_id: Uuid,
    pub talent_id: Uuid,
    /// Hex-encoded ZK proof bytes from the wallet.
    pub zk_proof_hex: String,
    pub verifier_did: String,
}

/// Published by SuccessTrigger / VetoFirst service after verification passes.
#[derive(Debug, Serialize, Deserialize)]
pub struct ReleaseEscrow {
    pub deployment_id: Uuid,
    pub freelancer_id: Uuid,
    /// Amount in minor currency units (USD cents).
    pub amount_cents: u64,
    pub reason: String,
}

/// Full escrow split release event.
/// Freelancer path: 15% platform + 70/30 of remainder (agency_id = None).
/// Agency path:     12% platform + agency_pct% of remainder + 70/30 of rest.
#[derive(Debug, Serialize, Deserialize)]
pub struct EscrowRelease {
    pub deployment_id:   Uuid,
    pub developer_id:    Uuid,
    pub developer_cents: u64,
    pub talent_id:       Uuid,
    pub talent_cents:    u64,
    /// Platform commission — 15% (freelancer) or 12% (agency).
    pub platform_cents:  u64,
    /// Agency owner profile ID. None for direct freelancer deployments.
    #[serde(default)]
    pub agency_id:       Option<Uuid>,
    /// Agency management fee in cents. Zero when agency_id is None.
    #[serde(default)]
    pub agency_cents:    u64,
}

// ── v2 Topic constants ────────────────────────────────────────────────────────
pub const TOPIC_LICENSE_COMMANDS: &str = "license.commands";
pub const TOPIC_CHECKLIST_EVENTS: &str = "checklist.events";
pub const TOPIC_WARRANTY_EVENTS: &str = "warranty.events";
pub const TOPIC_MATCH_REQUESTS: &str = "match.requests";
pub const TOPIC_MATCH_RESULTS: &str = "match.results";
pub const TOPIC_NOTIFICATION_FANOUT: &str = "notification.fanout";
pub const TOPIC_TELEMETRY_EVENTS: &str = "telemetry.events";
pub const TOPIC_DRIFT_ALERTS: &str = "drift.alerts";
pub const TOPIC_TRUST_EVENTS: &str = "trust.events";
pub const TOPIC_REPUTATION_COMMANDS: &str = "reputation.commands";

// ── License events ────────────────────────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize)]
pub struct LicenseIssued {
    pub license_id: Uuid,
    pub agent_id: Uuid,
    pub licensee_id: Uuid,
    pub jurisdiction: String,
    pub seats: u32,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LicenseRevoked {
    pub license_id: Uuid,
    pub reason: String,
}

// ── DoD Checklist events ──────────────────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize)]
pub struct ChecklistStepCompleted {
    pub deployment_id: Uuid,
    pub step_id: String,
    pub step_label: String,
    pub passed: bool,
    pub notes: Option<String>,
    pub completed_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChecklistFinalized {
    pub deployment_id: Uuid,
    pub all_passed: bool,
    pub failed_steps: Vec<String>,
}

// ── Warranty events ───────────────────────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize)]
pub struct WarrantyClaimed {
    pub claim_id: Uuid,
    pub deployment_id: Uuid,
    pub claimant_id: Uuid,
    pub drift_proof: String,
    pub claimed_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WarrantyResolved {
    pub claim_id: Uuid,
    pub resolution: String,
    pub resolved_at: DateTime<Utc>,
}

// ── Matching events ───────────────────────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize)]
pub struct MatchRequest {
    pub request_id: Uuid,
    pub agent_id: Uuid,
    pub required_skills: Vec<String>,
    pub min_trust_score: u8,
    pub jurisdiction: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TalentMatch {
    pub talent_id: Uuid,
    pub match_score: f32,
    pub trust_score: i16,
    pub skill_tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MatchResult {
    pub request_id: Uuid,
    pub matches: Vec<TalentMatch>,
}

// ── Telemetry / Drift events ──────────────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize)]
pub struct TelemetryHeartbeat {
    pub deployment_id: Uuid,
    pub artifact_hash: String,
    pub cpu_pct: f32,
    pub mem_bytes: u64,
    pub recorded_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DriftDetected {
    pub deployment_id: Uuid,
    pub expected_hash: String,
    pub actual_hash: String,
    pub detected_at: DateTime<Utc>,
}

// ── Reputation events ─────────────────────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize)]
pub struct ReputationExported {
    pub talent_id: Uuid,
    pub vc_jwt: String,
    pub issued_at: DateTime<Utc>,
}

// ── Collab / messaging events ─────────────────────────────────────────────────
pub const TOPIC_MESSAGE_SENT: &str = "collab.message_sent";

/// Emitted by marketplace_service after a chat message is persisted.
/// Consumed by notification_service to send async email notifications.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessageSent {
    pub deployment_id: Uuid,
    pub message_id: Uuid,
    pub sender_id: Uuid,
    pub sender_name: String,
    /// All deployment participants except the sender.
    pub recipient_ids: Vec<Uuid>,
    /// First 120 chars of the message body — safe for email preview.
    pub body_preview: String,
}

// ── Community & Growth events (Feature 08) ────────────────────────────────────
pub const TOPIC_COMMUNITY_EVENTS: &str = "community.events";

#[derive(Debug, Serialize, Deserialize)]
pub struct MentorshipPaired {
    pub pair_id: Uuid,
    pub mentor_id: Uuid,
    pub mentee_id: Uuid,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CohortCreated {
    pub cohort_id: Uuid,
    pub name: String,
    pub cohort_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CareerMilestoneReached {
    pub user_id: Uuid,
    pub milestone_key: String,
    pub label: String,
    pub xp_awarded: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LearningPathAssigned {
    pub user_id: Uuid,
    pub path_id: Uuid,
    pub skill_target: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BurnoutAlertRaised {
    pub user_id: Uuid,
    pub risk_level: String,
    pub risk_score: i16,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CarbonOffsetLogged {
    pub user_id: Uuid,
    pub offset_id: Uuid,
    pub offset_kg: f64,
    pub activity_type: String,
}
