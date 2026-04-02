//! Integration tests for the escrow split consumer.
//!
//! Tests both the freelancer path (15% platform + 70/30) and the agency path
//! (12% platform + agency_pct% management fee + 70/30 of remainder).
//!
//! Each test case boots a fresh Postgres container via testcontainers.

// Local test-helper module (tests/common/mod.rs)
mod common;
use common::{TestContext, new_deployment, new_listing, new_org, new_profile};

// Workspace `common` crate — use `::common` to distinguish from local `mod common`
use ::common::events::{EscrowRelease, ReleaseEscrow};

use marketplace_service::escrow_consumer::{process_escrow_release, process_release_escrow};
use uuid::Uuid;

// ── Helpers ───────────────────────────────────────────────────────────────────

async fn payout_count(pool: &sqlx::PgPool, deployment_id: Uuid, reason: &str) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM escrow_payouts
         WHERE deployment_id = $1 AND reason = $2",
    )
    .bind(deployment_id)
    .bind(reason)
    .fetch_one(pool)
    .await
    .expect("payout_count")
}

async fn payout_sum(pool: &sqlx::PgPool, deployment_id: Uuid) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(SUM(amount_cents), 0) FROM escrow_payouts WHERE deployment_id = $1",
    )
    .bind(deployment_id)
    .fetch_one(pool)
    .await
    .expect("payout_sum")
}

/// Returns `(fee_cents, fee_pct)` from platform_fees for a deployment.
async fn platform_fee(pool: &sqlx::PgPool, deployment_id: Uuid) -> (i64, i16) {
    let row = sqlx::query(
        "SELECT fee_cents, fee_pct FROM platform_fees WHERE deployment_id = $1",
    )
    .bind(deployment_id)
    .fetch_one(pool)
    .await
    .expect("platform_fee");
    use sqlx::Row;
    (row.get("fee_cents"), row.get("fee_pct"))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

/// Legacy `ReleaseEscrow` path: inserts one escrow_payout row.
/// ON CONFLICT DO NOTHING ensures idempotency on duplicate submission.
#[tokio::test]
async fn test_legacy_release_escrow_is_idempotent() {
    let ctx = TestContext::new().await;
    let pool = &ctx.pool;

    let profile_id = new_profile(pool).await;
    let listing_id = new_listing(pool, profile_id).await;
    let dep_id =
        new_deployment(pool, listing_id, profile_id, profile_id, 10_000, None, 0).await;

    let ev = ReleaseEscrow {
        deployment_id: dep_id,
        freelancer_id: profile_id,
        amount_cents:  3_000,
        reason:        "legacy_30pct".into(),
    };

    process_release_escrow(pool, &ev).await.expect("first call");
    assert_eq!(payout_count(pool, dep_id, "legacy_30pct").await, 1);

    // Second call must not double-insert.
    process_release_escrow(pool, &ev).await.expect("idempotent second call");
    assert_eq!(payout_count(pool, dep_id, "legacy_30pct").await, 1);
}

/// Freelancer path: 15% platform + 70/30 split.
///
/// $100.00 escrow:
///   platform = $15.00 | dev = $59.50 | talent = $25.50  → total = $100.00 ✓
#[tokio::test]
async fn test_freelancer_split_15pct_platform() {
    let ctx = TestContext::new().await;
    let pool = &ctx.pool;

    let profile_id = new_profile(pool).await;
    let listing_id = new_listing(pool, profile_id).await;
    let dep_id =
        new_deployment(pool, listing_id, profile_id, profile_id, 10_000, None, 0).await;

    let ev = EscrowRelease {
        deployment_id:   dep_id,
        developer_id:    profile_id,
        developer_cents: 5_950,
        talent_id:       profile_id,
        talent_cents:    2_550,
        platform_cents:  1_500,
        agency_id:       None,
        agency_cents:    0,
    };

    process_escrow_release(pool, &ev).await.expect("freelancer escrow release");

    // Exactly two payout rows: dev + talent
    assert_eq!(payout_count(pool, dep_id, "developer_pct").await, 1);
    assert_eq!(payout_count(pool, dep_id, "talent_pct").await, 1);
    assert_eq!(payout_count(pool, dep_id, "agency_mgmt_fee").await, 0);

    // platform_fees: 15% bucket
    let (fee_cents, fee_pct) = platform_fee(pool, dep_id).await;
    assert_eq!(fee_cents, 1_500);
    assert_eq!(fee_pct, 15);

    // Payout rows sum to escrow - platform
    assert_eq!(payout_sum(pool, dep_id).await, 5_950 + 2_550);
}

/// Agency path: 12% platform + agency mgmt fee + 70/30 of remainder.
///
/// $100.00 escrow, agency_pct = 10%:
///   platform = $12.00 | agency = $8.80 | dev = $55.44 | talent = $23.76 → total = $100.00 ✓
#[tokio::test]
async fn test_agency_split_10pct() {
    let ctx = TestContext::new().await;
    let pool = &ctx.pool;

    let owner_id   = new_profile(pool).await;
    let org_id     = new_org(pool, owner_id, 10).await;
    let listing_id = new_listing(pool, owner_id).await;
    let dep_id     = new_deployment(
        pool, listing_id, owner_id, owner_id, 10_000, Some(org_id), 10,
    ).await;

    // agency_id in EscrowRelease = owner's unified_profiles.id (FK-safe recipient)
    let ev = EscrowRelease {
        deployment_id:   dep_id,
        developer_id:    owner_id,
        developer_cents: 5_544,
        talent_id:       owner_id,
        talent_cents:    2_376,
        platform_cents:  1_200,
        agency_id:       Some(owner_id),
        agency_cents:    880,
    };

    process_escrow_release(pool, &ev).await.expect("agency escrow release");

    // Three payout rows: dev, talent, agency
    assert_eq!(payout_count(pool, dep_id, "developer_pct").await, 1);
    assert_eq!(payout_count(pool, dep_id, "talent_pct").await, 1);
    assert_eq!(payout_count(pool, dep_id, "agency_mgmt_fee").await, 1);

    // platform_fees: 12% bucket for agency deployments
    let (fee_cents, fee_pct) = platform_fee(pool, dep_id).await;
    assert_eq!(fee_cents, 1_200);
    assert_eq!(fee_pct, 12);

    // Lossless: payout rows sum to escrow - platform
    assert_eq!(payout_sum(pool, dep_id).await, 5_544 + 2_376 + 880);
}

/// Agency path with agency_pct = 0 → no agency_mgmt_fee row inserted.
#[tokio::test]
async fn test_agency_zero_pct_skips_agency_row() {
    let ctx = TestContext::new().await;
    let pool = &ctx.pool;

    let owner_id   = new_profile(pool).await;
    let org_id     = new_org(pool, owner_id, 0).await;
    let listing_id = new_listing(pool, owner_id).await;
    let dep_id     = new_deployment(
        pool, listing_id, owner_id, owner_id, 10_000, Some(org_id), 0,
    ).await;

    let ev = EscrowRelease {
        deployment_id:   dep_id,
        developer_id:    owner_id,
        developer_cents: 6_160,
        talent_id:       owner_id,
        talent_cents:    2_640,
        platform_cents:  1_200,
        agency_id:       Some(owner_id),
        agency_cents:    0, // zero → guard in consumer skips the row
    };

    process_escrow_release(pool, &ev).await.expect("zero agency_pct release");

    assert_eq!(payout_count(pool, dep_id, "agency_mgmt_fee").await, 0);

    let (_, fee_pct) = platform_fee(pool, dep_id).await;
    assert_eq!(fee_pct, 12, "12% platform fee even with zero agency_pct");
}

/// Bad FK → entire transaction must roll back; no rows committed.
#[tokio::test]
async fn test_escrow_release_rolls_back_on_fk_violation() {
    let ctx = TestContext::new().await;
    let pool = &ctx.pool;

    let fake_dep  = Uuid::now_v7(); // no deployments row
    let fake_user = Uuid::now_v7(); // no unified_profiles row

    let ev = EscrowRelease {
        deployment_id:   fake_dep,
        developer_id:    fake_user,
        developer_cents: 100,
        talent_id:       fake_user,
        talent_cents:    100,
        platform_cents:  50,
        agency_id:       None,
        agency_cents:    0,
    };

    assert!(
        process_escrow_release(pool, &ev).await.is_err(),
        "must fail on FK violation"
    );

    // Atomicity: no partial rows left
    assert_eq!(payout_count(pool, fake_dep, "developer_pct").await, 0);
}
