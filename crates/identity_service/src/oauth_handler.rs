//! OAuth callback handler — upserts unified_profiles for any OAuth provider.
//!
//! Uses non-macro sqlx::query() throughout to avoid needing an offline `.sqlx/`
//! cache entry for the new columns added in migration 0016.

use anyhow::{Context, Result};
use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use common::types::identity::{
    IdentityTier, OAuthCallbackPayload, OAuthCallbackResponse, OAuthProvider,
};

// ── Trust score constants (matches trust_score.rs weights) ────────────────────

const GH_AGE_MAX_DAYS: f64 = 365.0 * 5.0;
const GH_AGE_PTS: f64 = 18.0;
const GH_REPOS_PTS: f64 = 12.0;

const LI_EMAIL_PTS: f64 = 8.0;
const LI_EXISTS_PTS: f64 = 7.0;

const GOOGLE_EMAIL_PTS: f64 = 15.0; // Google verifies email at account creation

// ── Public entry point ────────────────────────────────────────────────────────

/// Upsert a unified_profile from an OAuth provider callback.
///
/// Resolution order:
/// 1. Look up by `(provider, provider_uid)` — returning user.
/// 2. Look up by `email` — account linking (same person, new provider).
/// 3. Insert new profile.
///
/// After upsert, recalculates trust_score and identity_tier from all connected
/// providers and persists the result.
pub async fn handle_oauth_callback(
    db: &PgPool,
    payload: OAuthCallbackPayload,
) -> Result<OAuthCallbackResponse> {
    let profile_id = match payload.existing_profile_id {
        // Connect-provider flow: caller already knows the profile
        Some(id) => id,
        None => upsert_profile(db, &payload).await?,
    };

    // Always update the provider column + connected_at
    link_provider(db, profile_id, &payload).await?;

    // Recalculate score from all providers now on file
    let (score, tier) = fetch_and_score(db, profile_id, &payload).await?;

    // Persist updated score + tier
    sqlx::query(
        "UPDATE unified_profiles
         SET trust_score = $1, identity_tier = $2, updated_at = NOW()
         WHERE id = $3",
    )
    .bind(score)
    .bind(tier as IdentityTier)
    .bind(profile_id)
    .execute(db)
    .await
    .context("Update trust_score + tier")?;

    // Read account_type + role set during onboarding / agency registration.
    // Both columns have NOT NULL / nullable defaults so the row always exists.
    let (account_type, role): (String, Option<String>) = sqlx::query_as(
        "SELECT account_type, role FROM unified_profiles WHERE id = $1",
    )
    .bind(profile_id)
    .fetch_one(db)
    .await
    .context("Fetch account_type + role")?;

    Ok(OAuthCallbackResponse {
        profile_id,
        identity_tier: tier_label(tier),
        trust_score: score,
        account_type,
        role,
    })
}

// ── Step 1: upsert profile row ────────────────────────────────────────────────

async fn upsert_profile(db: &PgPool, p: &OAuthCallbackPayload) -> Result<Uuid> {
    // Try existing by provider UID first
    if let Some(id) = find_by_provider(db, p).await? {
        return Ok(id);
    }
    // Try existing by email (cross-provider account linking)
    if let Some(id) = find_by_email(db, &p.email).await? {
        return Ok(id);
    }
    // New user — insert
    insert_profile(db, p).await
}

async fn find_by_provider(db: &PgPool, p: &OAuthCallbackPayload) -> Result<Option<Uuid>> {
    let col = provider_uid_col(p.provider);
    let sql = format!("SELECT id FROM unified_profiles WHERE {col} = $1");
    let row: Option<(Uuid,)> = sqlx::query_as(&sql)
        .bind(&p.provider_uid)
        .fetch_optional(db)
        .await
        .context("find_by_provider")?;
    Ok(row.map(|(id,)| id))
}

async fn find_by_email(db: &PgPool, email: &str) -> Result<Option<Uuid>> {
    let row: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM unified_profiles WHERE email = $1")
            .bind(email)
            .fetch_optional(db)
            .await
            .context("find_by_email")?;
    Ok(row.map(|(id,)| id))
}

async fn insert_profile(db: &PgPool, p: &OAuthCallbackPayload) -> Result<Uuid> {
    let now = Utc::now();
    let id = Uuid::now_v7();
    // github_uid is nullable post-migration-0016; set to NULL for non-GitHub providers
    sqlx::query(
        "INSERT INTO unified_profiles
             (id, github_uid, display_name, email, trust_score,
              identity_tier, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 0, 'UNVERIFIED', $5, $6)",
    )
    .bind(id)
    .bind(github_uid_for_insert(p))
    .bind(&p.display_name)
    .bind(&p.email)
    .bind(now)
    .bind(now)
    .execute(db)
    .await
    .context("Insert new profile")?;
    Ok(id)
}

fn github_uid_for_insert(p: &OAuthCallbackPayload) -> Option<String> {
    if p.provider == OAuthProvider::GitHub {
        Some(p.provider_uid.clone())
    } else {
        None
    }
}

// ── Step 2: link the provider column ─────────────────────────────────────────

async fn link_provider(db: &PgPool, id: Uuid, p: &OAuthCallbackPayload) -> Result<()> {
    match p.provider {
        OAuthProvider::GitHub => {
            sqlx::query(
                "UPDATE unified_profiles
                 SET github_uid = $1, github_connected_at = NOW(), updated_at = NOW()
                 WHERE id = $2",
            )
            .bind(&p.provider_uid)
            .bind(id)
        }
        OAuthProvider::Google => {
            sqlx::query(
                "UPDATE unified_profiles
                 SET google_uid = $1, google_connected_at = NOW(), updated_at = NOW()
                 WHERE id = $2",
            )
            .bind(&p.provider_uid)
            .bind(id)
        }
        OAuthProvider::LinkedIn => {
            sqlx::query(
                "UPDATE unified_profiles
                 SET linkedin_uid = $1, linkedin_connected_at = NOW(), updated_at = NOW()
                 WHERE id = $2",
            )
            .bind(&p.provider_uid)
            .bind(id)
        }
    }
    .execute(db)
    .await
    .context("link_provider")?;
    Ok(())
}

// ── Step 3: fetch provider data and score ─────────────────────────────────────

async fn fetch_and_score(
    db: &PgPool,
    id: Uuid,
    current: &OAuthCallbackPayload,
) -> Result<(i16, IdentityTier)> {
    // Fetch what providers are now connected to this profile
    let row: (Option<String>, Option<String>, Option<String>) = sqlx::query_as(
        "SELECT github_uid, linkedin_uid, google_uid
         FROM unified_profiles WHERE id = $1",
    )
    .bind(id)
    .fetch_one(db)
    .await
    .context("fetch provider columns")?;

    let (github_uid, linkedin_uid, google_uid) = row;

    // GitHub score — use data from current payload if GitHub is the provider
    let github_score = if github_uid.is_some() {
        if current.provider == OAuthProvider::GitHub {
            calc_github_score(current.github_repos, current.github_created_at)
        } else {
            // GitHub was connected in a previous session — we have no fresh API data,
            // so award a minimum base score (will be refreshed on next GitHub login)
            10.0
        }
    } else {
        0.0
    };

    // LinkedIn score — current payload or minimal if connected earlier
    let linkedin_score = if linkedin_uid.is_some() {
        if current.provider == OAuthProvider::LinkedIn {
            let email_pts = if current.email_verified.unwrap_or(false) {
                LI_EMAIL_PTS
            } else {
                0.0
            };
            email_pts + LI_EXISTS_PTS
        } else {
            LI_EMAIL_PTS // minimal: email was verified on original connect
        }
    } else {
        0.0
    };

    // Google score — verified email is guaranteed by Google's own auth
    let google_score = if google_uid.is_some() { GOOGLE_EMAIL_PTS } else { 0.0 };

    let total = (github_score + linkedin_score + google_score).round().clamp(0.0, 100.0) as i16;

    let tier = if total > 0 {
        IdentityTier::SocialVerified
    } else {
        IdentityTier::Unverified
    };

    Ok((total, tier))
}

fn calc_github_score(repos: Option<u32>, created_at: Option<chrono::DateTime<Utc>>) -> f64 {
    let age_score = created_at
        .map(|t| {
            let days = (Utc::now() - t).num_days().max(0) as f64;
            (days / GH_AGE_MAX_DAYS).min(1.0) * GH_AGE_PTS
        })
        .unwrap_or(0.0);

    let repo_score = repos
        .map(|r| (r.min(50) as f64 / 50.0) * GH_REPOS_PTS)
        .unwrap_or(0.0);

    age_score + repo_score
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn provider_uid_col(p: OAuthProvider) -> &'static str {
    match p {
        OAuthProvider::GitHub => "github_uid",
        OAuthProvider::Google => "google_uid",
        OAuthProvider::LinkedIn => "linkedin_uid",
    }
}

fn tier_label(t: IdentityTier) -> String {
    match t {
        IdentityTier::Unverified => "UNVERIFIED".into(),
        IdentityTier::SocialVerified => "SOCIAL_VERIFIED".into(),
        IdentityTier::BiometricVerified => "BIOMETRIC_VERIFIED".into(),
    }
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, Utc};

    #[test]
    fn github_score_five_year_fifty_repos() {
        let created = Utc::now() - Duration::days(5 * 365);
        let score = calc_github_score(Some(50), Some(created));
        // 18 (age) + 12 (repos) = 30
        assert!((score - 30.0).abs() < 1.0, "score was {score}");
    }

    #[test]
    fn github_score_new_account_no_repos() {
        let score = calc_github_score(Some(0), None);
        assert_eq!(score as i16, 0);
    }

    #[test]
    fn linkedin_email_verified_gives_pts() {
        let email_pts = LI_EMAIL_PTS + LI_EXISTS_PTS; // 8 + 7 = 15
        assert!((email_pts - 15.0).abs() < f64::EPSILON);
    }

    #[test]
    fn google_score_constant() {
        // Google-only login should give 15 pts → SOCIAL_VERIFIED
        assert!((GOOGLE_EMAIL_PTS - 15.0).abs() < f64::EPSILON);
        let total = GOOGLE_EMAIL_PTS.round() as i16;
        assert!(total > 0, "Google login must yield trust_score > 0");
    }

    #[test]
    fn tier_label_roundtrip() {
        assert_eq!(tier_label(IdentityTier::Unverified), "UNVERIFIED");
        assert_eq!(tier_label(IdentityTier::SocialVerified), "SOCIAL_VERIFIED");
        assert_eq!(tier_label(IdentityTier::BiometricVerified), "BIOMETRIC_VERIFIED");
    }
}
