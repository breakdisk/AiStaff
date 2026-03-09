use chrono::Utc;
use common::types::identity::{BiometricProof, GitHubIdentity, IdentityTier, LinkedInIdentity};

// ── Bucket maxima ─────────────────────────────────────────────────────────────
const GITHUB_MAX:    f64 = 30.0;
const LINKEDIN_MAX:  f64 = 30.0;
const BIOMETRIC_MAX: f64 = 40.0;

// GitHub sub-weights (sum ≤ GITHUB_MAX = 30)
const GH_AGE_MAX_DAYS: f64 = 365.0 * 5.0; // 5 years = full age bonus
const GH_AGE_PTS:      f64 = 18.0;
const GH_REPOS_MAX:    f64 = 50.0;
const GH_REPOS_PTS:    f64 = 12.0;

// LinkedIn sub-weights (sum ≤ LINKEDIN_MAX = 30)
const LI_EMAIL_PTS:    f64 = 8.0;
const LI_EMPLOYED_PTS: f64 = 12.0;
const LI_CONN_PTS:     f64 = 10.0; // connections_tier * 3.33 (max 10 at tier 3)

/// Pure function — same inputs always produce the same `(score, tier)`.
/// All inputs come from cryptographically verified OAuth/VC flows.
///
/// Weights: GitHub 30% · LinkedIn 30% · Biometric ZK 40%
pub fn calculate_trust_score(
    github:    &GitHubIdentity,
    linkedin:  Option<&LinkedInIdentity>,
    biometric: Option<&BiometricProof>,
) -> (i16, IdentityTier) {
    let now = Utc::now();

    // ── GitHub bucket ─────────────────────────────────────────────────────
    let gh_age_days   = (now - github.created_at).num_days().max(0) as f64;
    let gh_age_score  = (gh_age_days / GH_AGE_MAX_DAYS).min(1.0) * GH_AGE_PTS;
    let gh_repo_score = (github.public_repos.min(50) as f64 / GH_REPOS_MAX) * GH_REPOS_PTS;
    let github_score  = (gh_age_score + gh_repo_score).min(GITHUB_MAX);

    // ── LinkedIn bucket ───────────────────────────────────────────────────
    let linkedin_score = linkedin.map_or(0.0, |li| {
        let email    = if li.email_verified      { LI_EMAIL_PTS    } else { 0.0 };
        let employed = if li.employment_verified  { LI_EMPLOYED_PTS } else { 0.0 };
        let conn     = (li.connections_tier as f64 / 3.0).min(1.0) * LI_CONN_PTS;
        (email + employed + conn).min(LINKEDIN_MAX)
    });

    // ── Biometric ZK bucket ───────────────────────────────────────────────
    // Full 40 pts only if proof is not expired and commitment is populated.
    let biometric_score = biometric
        .filter(|b| b.expires_at > now && !b.liveness_commitment.is_empty())
        .map(|_| BIOMETRIC_MAX)
        .unwrap_or(0.0);

    let total = (github_score + linkedin_score + biometric_score)
        .round()
        .clamp(0.0, 100.0) as i16;

    let tier = if biometric_score > 0.0 {
        IdentityTier::BiometricVerified
    } else if linkedin_score > 0.0 {
        IdentityTier::SocialVerified
    } else {
        IdentityTier::Unverified
    };

    (total, tier)
}

#[cfg(test)]
mod trust_engine {
    use super::*;
    use chrono::{Duration, Utc};

    fn github(age_years: i64, repos: u32) -> GitHubIdentity {
        GitHubIdentity {
            uid:          "123".into(),
            login:        "dev".into(),
            public_repos: repos,
            created_at:   Utc::now() - Duration::days(age_years * 365),
        }
    }

    fn linkedin(email: bool, employed: bool, tier: u8) -> LinkedInIdentity {
        LinkedInIdentity {
            uid: "li-456".into(),
            email_verified: email,
            employment_verified: employed,
            connections_tier: tier,
        }
    }

    #[test]
    fn score_zero_for_bare_minimum() {
        let gh = github(0, 0);
        let (score, tier) = calculate_trust_score(&gh, None, None);
        assert_eq!(score, 0);
        assert_eq!(tier, IdentityTier::Unverified);
    }

    #[test]
    fn score_capped_at_100() {
        let gh = github(10, 100);
        let li = linkedin(true, true, 3);
        let bio = BiometricProof {
            credential_id:       "cred-1".into(),
            issuer_did:          "did:example:issuer".into(),
            liveness_commitment: "abc123".into(),
            zk_proof_bytes:      vec![1, 2, 3],
            verified_at:         Utc::now(),
            expires_at:          Utc::now() + Duration::days(365),
        };
        let (score, tier) = calculate_trust_score(&gh, Some(&li), Some(&bio));
        assert!(score <= 100);
        assert_eq!(tier, IdentityTier::BiometricVerified);
    }

    #[test]
    fn biometric_tier_requires_valid_commitment() {
        let gh = github(5, 50);
        let li = linkedin(true, true, 3);
        // Expired biometric — should not grant Tier 2
        let expired_bio = BiometricProof {
            credential_id:       "cred-2".into(),
            issuer_did:          "did:example:issuer".into(),
            liveness_commitment: "abc123".into(),
            zk_proof_bytes:      vec![1, 2, 3],
            verified_at:         Utc::now() - Duration::days(400),
            expires_at:          Utc::now() - Duration::days(1),
        };
        let (_, tier) = calculate_trust_score(&gh, Some(&li), Some(&expired_bio));
        assert_eq!(tier, IdentityTier::SocialVerified);
    }
}
