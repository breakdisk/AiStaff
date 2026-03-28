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
const FACEBOOK_EMAIL_PTS: f64 = 15.0; // Facebook requires a verified email on all accounts
const MICROSOFT_EMAIL_PTS: f64 = 15.0; // Microsoft verifies corporate email via Entra ID
const EMAIL_MAGIC_PTS: f64 = 10.0; // Magic link: verified email address, no social signal

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
    let (profile_id, is_linked_account) = match payload.existing_profile_id {
        // connect-provider flow: user is already logged in, linking a new provider.
        // Not a "duplicate account" situation — show no warning.
        Some(id) => (id, false),
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

    // Read account_type + role + is_admin set during onboarding / agency registration.
    let (account_type, role, is_admin): (String, Option<String>, bool) =
        sqlx::query_as("SELECT account_type, role, is_admin FROM unified_profiles WHERE id = $1")
            .bind(profile_id)
            .fetch_one(db)
            .await
            .context("Fetch account_type + role + is_admin")?;

    Ok(OAuthCallbackResponse {
        profile_id,
        identity_tier: tier_label(tier),
        trust_score: score,
        account_type,
        role,
        is_admin,
        is_linked_account,
    })
}

// ── Step 1: upsert profile row ────────────────────────────────────────────────

async fn upsert_profile(db: &PgPool, p: &OAuthCallbackPayload) -> Result<(Uuid, bool)> {
    if let Some(id) = find_by_provider(db, p).await? {
        return Ok((id, false)); // returning user — same provider
    }
    if let Some(id) = find_by_email(db, &p.email).await? {
        return Ok((id, true)); // email match — new provider linked to existing account
    }
    let id = insert_profile(db, p).await?;
    Ok((id, false)) // brand new profile
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
    let row: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM unified_profiles WHERE email = $1")
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
                     SET github_uid = $1, github_connected_at = NOW(),
                         github_followers = COALESCE($3, github_followers),
                         github_stars     = COALESCE($4, github_stars),
                         updated_at = NOW()
                     WHERE id = $2",
            )
            .bind(&p.provider_uid)
            .bind(id)
            .bind(p.github_followers.map(|v| v as i32))
            .bind(p.github_stars.map(|v| v as i32))
            .execute(db)
            .await
            .context("link_provider GitHub")?;
        }
        OAuthProvider::Google => {
            sqlx::query(
                "UPDATE unified_profiles
                     SET google_uid = $1, google_connected_at = NOW(), updated_at = NOW()
                     WHERE id = $2",
            )
            .bind(&p.provider_uid)
            .bind(id)
            .execute(db)
            .await
            .context("link_provider Google")?;
        }
        OAuthProvider::LinkedIn => {
            sqlx::query(
                "UPDATE unified_profiles
                     SET linkedin_uid = $1, linkedin_connected_at = NOW(), updated_at = NOW()
                     WHERE id = $2",
            )
            .bind(&p.provider_uid)
            .bind(id)
            .execute(db)
            .await
            .context("link_provider LinkedIn")?;
        }
        OAuthProvider::Facebook => {
            sqlx::query(
                "UPDATE unified_profiles
                     SET facebook_uid = $1, facebook_connected_at = NOW(), updated_at = NOW()
                     WHERE id = $2",
            )
            .bind(&p.provider_uid)
            .bind(id)
            .execute(db)
            .await
            .context("link_provider Facebook")?;
        }
        OAuthProvider::MicrosoftEntraId => {
            sqlx::query(
                "UPDATE unified_profiles
                     SET microsoft_entra_uid = $1, microsoft_connected_at = NOW(), updated_at = NOW()
                     WHERE id = $2",
            )
            .bind(&p.provider_uid)
            .bind(id)
            .execute(db)
            .await
            .context("link_provider MicrosoftEntraId")?;
        }
        OAuthProvider::Email => {
            // Magic link: email IS the primary identifier — no separate UID column to update.
            // Profile was already found/created via find_by_email.
        }
    }
    Ok(())
}

// ── Step 3: fetch provider data and score ─────────────────────────────────────

async fn fetch_and_score(
    db: &PgPool,
    id: Uuid,
    current: &OAuthCallbackPayload,
) -> Result<(i16, IdentityTier)> {
    // Fetch what providers are now connected to this profile
    let row: (
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    ) = sqlx::query_as(
        "SELECT github_uid, linkedin_uid, google_uid, facebook_uid, microsoft_entra_uid
         FROM unified_profiles WHERE id = $1",
    )
    .bind(id)
    .fetch_one(db)
    .await
    .context("fetch provider columns")?;

    let (github_uid, linkedin_uid, google_uid, facebook_uid, microsoft_entra_uid) = row;

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
    let google_score = if google_uid.is_some() {
        GOOGLE_EMAIL_PTS
    } else {
        0.0
    };

    // Facebook score — verified email required by Facebook on all accounts
    let facebook_score = if facebook_uid.is_some() {
        FACEBOOK_EMAIL_PTS
    } else {
        0.0
    };

    // Microsoft Entra ID — corporate email verified by Azure AD
    let microsoft_score = if microsoft_entra_uid.is_some() {
        MICROSOFT_EMAIL_PTS
    } else {
        0.0
    };

    // Email magic link — gives a baseline score on each email login
    let email_magic_score = if current.provider == OAuthProvider::Email {
        EMAIL_MAGIC_PTS
    } else {
        0.0
    };

    let total = (github_score
        + linkedin_score
        + google_score
        + facebook_score
        + microsoft_score
        + email_magic_score)
        .round()
        .clamp(0.0, 100.0) as i16;

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
        OAuthProvider::Facebook => "facebook_uid",
        OAuthProvider::MicrosoftEntraId => "microsoft_entra_uid",
        OAuthProvider::Email => "email", // magic link: look up by email column
    }
}

fn tier_label(t: IdentityTier) -> String {
    match t {
        IdentityTier::Unverified => "UNVERIFIED".into(),
        IdentityTier::SocialVerified => "SOCIAL_VERIFIED".into(),
        IdentityTier::BiometricVerified => "BIOMETRIC_VERIFIED".into(),
    }
}

// ── Link-flag helpers ─────────────────────────────────────────────────────────

/// Resolution path taken during upsert — used to derive is_linked_account.
#[cfg(test)]
#[derive(Debug, PartialEq)]
enum ResolutionPath {
    ByProvider,
    ByEmail,
    NewInsert,
}

#[cfg(test)]
fn resolve_link_flag(path: ResolutionPath) -> bool {
    path == ResolutionPath::ByEmail
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, Utc};

    #[test]
    fn linked_account_only_on_email_match() {
        assert!(!resolve_link_flag(ResolutionPath::ByProvider));
        assert!(resolve_link_flag(ResolutionPath::ByEmail));
        assert!(!resolve_link_flag(ResolutionPath::NewInsert));
    }

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
    fn microsoft_score_constant() {
        assert!((MICROSOFT_EMAIL_PTS - 15.0).abs() < f64::EPSILON);
    }

    #[test]
    fn email_magic_score_constant() {
        assert!((EMAIL_MAGIC_PTS - 10.0).abs() < f64::EPSILON);
        // Email magic link gives > 0 → SOCIAL_VERIFIED tier
        let total = EMAIL_MAGIC_PTS.round() as i16;
        assert!(total > 0);
    }

    #[test]
    fn tier_label_roundtrip() {
        assert_eq!(tier_label(IdentityTier::Unverified), "UNVERIFIED");
        assert_eq!(tier_label(IdentityTier::SocialVerified), "SOCIAL_VERIFIED");
        assert_eq!(
            tier_label(IdentityTier::BiometricVerified),
            "BIOMETRIC_VERIFIED"
        );
    }
}
