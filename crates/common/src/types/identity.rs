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
///
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct UnifiedProfile {
    pub id: Uuid,
    pub github_uid: Option<String>,
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

// ── OAuth multi-provider types (added in migration 0016) ──────────────────────

/// Which OAuth provider initiated the login or connect request.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OAuthProvider {
    GitHub,
    Google,
    LinkedIn,
    Facebook,
}

/// Payload sent from Next.js → identity_service after any OAuth callback.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthCallbackPayload {
    pub provider: OAuthProvider,
    /// Stable provider-specific user ID (GitHub numeric ID, Google sub, LinkedIn sub).
    pub provider_uid: String,
    pub email: String,
    pub display_name: String,
    /// Number of public GitHub repos — present only for GitHub provider.
    pub github_repos: Option<u32>,
    /// GitHub account creation ISO-8601 timestamp — present only for GitHub provider.
    pub github_created_at: Option<DateTime<Utc>>,
    /// GitHub follower count — present only for GitHub provider.
    pub github_followers: Option<u32>,
    /// GitHub public repos count (used as star-count proxy) — present only for GitHub provider.
    pub github_stars: Option<u32>,
    /// Whether the provider verified the email address.
    pub email_verified: Option<bool>,
    /// For connect-provider flow: existing profile to update.
    pub existing_profile_id: Option<Uuid>,
}

/// Response from `POST /identity/oauth-callback`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthCallbackResponse {
    pub profile_id: Uuid,
    /// "UNVERIFIED" | "SOCIAL_VERIFIED" | "BIOMETRIC_VERIFIED"
    pub identity_tier: String,
    pub trust_score: i16,
    /// "individual" | "agency" — from `unified_profiles.account_type`
    pub account_type: String,
    /// "talent" | "client" | "agent-owner" | null (null = new user, not yet through onboarding)
    pub role: Option<String>,
    /// Platform-owner admin flag — true only for designated admins
    #[serde(default)]
    pub is_admin: bool,
    /// True when this login resolved an existing profile by email match
    /// (new OAuth provider linked to an existing account).
    #[serde(default)]
    pub is_linked_account: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oauth_callback_response_is_linked_account_defaults_false() {
        // Deserialising a payload that omits is_linked_account must default to false
        // (existing callers don't send it yet — serde default is required)
        let json = r#"{
            "profile_id": "00000000-0000-0000-0000-000000000001",
            "identity_tier": "UNVERIFIED",
            "trust_score": 0,
            "account_type": "individual",
            "role": null,
            "is_admin": false
        }"#;
        let r: OAuthCallbackResponse = serde_json::from_str(json).unwrap();
        assert!(!r.is_linked_account);
    }
}
