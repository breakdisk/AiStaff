use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Verified data from GitHub OAuth + profile API.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubIdentity {
    /// Stable numeric GitHub user ID.
    pub uid: String,
    pub login: String,
    pub public_repos: u32,
    /// Account creation date — key input for trust scoring.
    pub created_at: DateTime<Utc>,
}

/// Verified data from LinkedIn OAuth + profile API.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkedInIdentity {
    /// LinkedIn `sub` claim (stable).
    pub uid: String,
    pub email_verified: bool,
    pub employment_verified: bool,
    /// 0=unknown, 1=<100 connections, 2=<500, 3=500+
    pub connections_tier: u8,
}

/// Biometric proof from OpenID4VP wallet — contains ZK commitment, not raw template.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BiometricProof {
    pub credential_id: String,
    pub issuer_did: String,
    /// Blake3 hash of (nonce || zk_proof_bytes) — the ONLY biometric-derived value stored.
    pub liveness_commitment: String,
    /// Serialized arkworks Groth16 proof bytes.
    pub zk_proof_bytes: Vec<u8>,
    pub verified_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

/// Identity tier — determines platform permissions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "identity_tier", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum IdentityTier {
    /// GitHub only — read-only marketplace access.
    Unverified,
    /// GitHub + LinkedIn — can bid on projects.
    SocialVerified,
    /// GitHub + LinkedIn + ZK biometric — full access + escrow eligibility.
    BiometricVerified,
}

/// Canonical identity record — written to DB, embedded in auth tokens.
/// PRIVACY: raw biometric data is NEVER stored in this struct or the DB.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct UnifiedProfile {
    pub id: Uuid,
    pub github_uid: String,
    pub linkedin_uid: Option<String>,
    pub display_name: String,
    pub email: String,
    /// 0–100; i16 matches Postgres `smallint`.
    pub trust_score: i16,
    /// Blake3(nonce || proof) commitment — no raw biometric stored.
    pub biometric_commitment: Option<String>,
    pub identity_tier: IdentityTier,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
