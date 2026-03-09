use anyhow::{bail, Result};
use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

/// Validates that a license is active, not revoked, not expired, and covers the
/// requested jurisdiction.
pub async fn validate(
    db:           &PgPool,
    license_id:   Uuid,
    jurisdiction: &str,
) -> Result<()> {
    let row = sqlx::query!(
        "SELECT jurisdiction, expires_at, revoked_at
         FROM licenses WHERE id = $1",
        license_id
    )
    .fetch_optional(db)
    .await?;

    let row = match row {
        Some(r) => r,
        None => bail!("license {license_id} not found"),
    };

    if row.revoked_at.is_some() {
        bail!("license {license_id} has been revoked");
    }
    if row.expires_at < Utc::now() {
        bail!("license {license_id} has expired");
    }
    if row.jurisdiction.trim() != jurisdiction {
        bail!(
            "license jurisdiction '{}' does not match deployment jurisdiction '{jurisdiction}'",
            row.jurisdiction.trim()
        );
    }

    Ok(())
}
