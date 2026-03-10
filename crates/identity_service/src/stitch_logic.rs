//! Identity stitching pipeline — orchestrates OAuth identity stitching,
//! biometric ZK verification, and async trust-score recalculation.

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use common::types::identity::{GitHubIdentity, IdentityTier, LinkedInIdentity, UnifiedProfile};

use crate::{
    trust_score::calculate_trust_score,
    zk_verifier::{derive_commitment, verify_liveness_proof, ZkPublicInputs},
};

pub struct StitchConfig {
    /// Serialized `PreparedVerifyingKey<Bn254>` — loaded from disk at startup.
    pub zk_verifying_key: Vec<u8>,
}

pub struct StitchService {
    db: PgPool,
    config: Arc<StitchConfig>,
}

impl StitchService {
    pub fn new(db: PgPool, config: Arc<StitchConfig>) -> Self {
        Self { db, config }
    }

    /// Phase 1: GitHub + LinkedIn → Tier 1 profile.
    /// Trust-score recalculation runs in a background task so the API responds immediately.
    pub async fn stitch_social(
        &self,
        github: GitHubIdentity,
        linkedin: LinkedInIdentity,
        email: String,
    ) -> Result<UnifiedProfile> {
        let now = Utc::now();

        // Background trust-score computation — non-blocking
        let gh_bg = github.clone();
        let li_bg = linkedin.clone();
        let db_bg = self.db.clone();
        tokio::spawn(async move {
            let (score, tier) = calculate_trust_score(&gh_bg, Some(&li_bg), None);
            let _ = sqlx::query!(
                r#"UPDATE unified_profiles
                   SET trust_score = $2, identity_tier = $3, updated_at = NOW()
                   WHERE github_uid = $1"#,
                gh_bg.uid,
                score,
                tier as IdentityTier,
            )
            .execute(&db_bg)
            .await;
        });

        let profile = sqlx::query_as!(
            UnifiedProfile,
            r#"INSERT INTO unified_profiles
                   (id, github_uid, linkedin_uid, display_name, email,
                    trust_score, biometric_commitment, identity_tier, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, 0, NULL, 'SOCIAL_VERIFIED', $6, $7)
               ON CONFLICT (github_uid) DO UPDATE SET
                   linkedin_uid = EXCLUDED.linkedin_uid,
                   updated_at   = EXCLUDED.updated_at
               RETURNING
                   id, github_uid, linkedin_uid, display_name, email,
                   trust_score, biometric_commitment,
                   identity_tier AS "identity_tier: IdentityTier",
                   created_at, updated_at"#,
            Uuid::new_v4(),
            github.uid,
            linkedin.uid,
            github.login,
            email,
            now,
            now,
        )
        .fetch_one(&self.db)
        .await
        .context("Upsert unified_profiles")?;

        Ok(profile)
    }

    /// Phase 2: Elevate to Tier 2 by verifying the wallet's ZK liveness proof.
    /// Raw proof bytes are verified then discarded — only the Blake3 commitment persists.
    pub async fn apply_biometric_proof(
        &self,
        profile_id: Uuid,
        proof_bytes: Vec<u8>,
        nonce: Vec<u8>,
        _issuer_did: String,
        _expires_at: DateTime<Utc>,
    ) -> Result<UnifiedProfile> {
        let commitment_hex = derive_commitment(&nonce, &proof_bytes);

        // Build ZK public inputs
        let nonce_hash_bytes = *blake3::hash(&nonce).as_bytes();
        let commitment_raw = hex::decode(&commitment_hex)?;
        let mut commitment_arr = [0u8; 32];
        commitment_arr.copy_from_slice(&commitment_raw);

        let public_in = ZkPublicInputs {
            nonce_hash: nonce_hash_bytes,
            liveness_commitment: commitment_arr,
        };

        let valid = verify_liveness_proof(&proof_bytes, &self.config.zk_verifying_key, &public_in)
            .context("ZK verification failed")?;

        if !valid {
            anyhow::bail!("ZK liveness proof is cryptographically invalid");
        }

        // Proof verified — persist commitment only; raw bytes dropped here
        let profile = sqlx::query_as!(
            UnifiedProfile,
            r#"UPDATE unified_profiles
               SET biometric_commitment = $2,
                   identity_tier        = 'BIOMETRIC_VERIFIED',
                   updated_at           = NOW()
               WHERE id = $1
               RETURNING
                   id, github_uid, linkedin_uid, display_name, email,
                   trust_score, biometric_commitment,
                   identity_tier AS "identity_tier: IdentityTier",
                   created_at, updated_at"#,
            profile_id,
            commitment_hex,
        )
        .fetch_one(&self.db)
        .await
        .context("Update biometric commitment")?;

        // Async trust-score bump — adds biometric bucket (40 pts) non-blocking
        let db_bg = self.db.clone();
        tokio::spawn(async move {
            let _ = sqlx::query!(
                "UPDATE unified_profiles
                 SET trust_score = LEAST(trust_score + 40, 100), updated_at = NOW()
                 WHERE id = $1",
                profile_id,
            )
            .execute(&db_bg)
            .await;
        });

        Ok(profile)
    }
}
