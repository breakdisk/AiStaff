//! Shared test helpers for marketplace_service integration tests.
//!
//! Boots a real Postgres container, runs all workspace migrations, and
//! provides helpers to seed the minimal required rows for each test.

use sqlx::{postgres::PgPoolOptions, PgPool};
use testcontainers::{runners::AsyncRunner, ContainerAsync, ImageExt};
use testcontainers_modules::postgres::Postgres;
use uuid::Uuid;

/// Live testcontainer context.  Keep alive for the test's lifetime.
pub struct TestContext {
    pub pool: PgPool,
    /// Held so the container stays running for the duration of the test.
    _container: ContainerAsync<Postgres>,
}

impl TestContext {
    /// Spin up a fresh Postgres 16 container and run all workspace migrations.
    pub async fn new() -> Self {
        let container = Postgres::default()
            .with_tag("16-alpine")
            .start()
            .await
            .expect("postgres container failed to start");

        let host = container.get_host().await.expect("get_host");
        let port = container.get_host_port_ipv4(5432).await.expect("get_port");

        let url = format!("postgres://postgres:postgres@{host}:{port}/postgres");

        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(&url)
            .await
            .expect("db pool connect");

        // Run every migration from the workspace root migrations/ directory.
        sqlx::migrate!("../../migrations")
            .run(&pool)
            .await
            .expect("migrations failed");

        Self { pool, _container: container }
    }
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

/// Insert a minimal `unified_profiles` row.  Returns the new UUID.
pub async fn new_profile(pool: &PgPool) -> Uuid {
    let id = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO unified_profiles
             (id, github_uid, display_name, email, trust_score, identity_tier,
              account_type, created_at, updated_at)
         VALUES ($1, NULL, 'Test User', $2, 20, 'SOCIAL_VERIFIED',
                 'individual', NOW(), NOW())",
    )
    .bind(id)
    .bind(format!("test-{}@example.com", id))
    .execute(pool)
    .await
    .expect("insert unified_profiles");
    id
}

/// Insert a minimal `organisations` row.  Returns the org UUID.
pub async fn new_org(pool: &PgPool, owner_id: Uuid, agency_pct: i16) -> Uuid {
    let org_id = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO organisations
             (id, name, owner_id, plan_tier, agency_pct, created_at, updated_at)
         VALUES ($1, 'Test Agency', $2, 'GROWTH', $3, NOW(), NOW())",
    )
    .bind(org_id)
    .bind(owner_id)
    .bind(agency_pct)
    .execute(pool)
    .await
    .expect("insert organisations");
    org_id
}

/// Insert a minimal `agent_listings` row.  Returns the listing UUID.
pub async fn new_listing(pool: &PgPool, developer_id: Uuid) -> Uuid {
    let id = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO agent_listings
             (id, developer_id, name, description, wasm_hash, price_cents,
              category, seller_type, slug, listing_status, active,
              created_at, updated_at)
         VALUES ($1, $2, 'Test Agent', 'desc', 'aabbcc', 10000,
                 'AiStaff', 'Freelancer', $3,
                 'APPROVED', TRUE, NOW(), NOW())",
    )
    .bind(id)
    .bind(developer_id)
    .bind(format!("test-agent-{}", id))
    .execute(pool)
    .await
    .expect("insert agent_listings");
    id
}

/// Insert a minimal `deployments` row.  `agency_id` may be `None`.
pub async fn new_deployment(
    pool: &PgPool,
    agent_id: Uuid,
    client_id: Uuid,
    developer_id: Uuid,
    escrow_cents: i64,
    agency_id: Option<Uuid>,
    agency_pct: i16,
) -> Uuid {
    let id = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO deployments
             (id, agent_id, client_id, freelancer_id, developer_id,
              agent_artifact_hash, escrow_amount_cents, transaction_id,
              agency_id, agency_pct,
              payment_status, state,
              created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4, 'deadbeef', $5, $6,
                 $7, $8, 'confirmed', 'PENDING'::deployment_status,
                 NOW(), NOW())",
    )
    .bind(id)
    .bind(agent_id)
    .bind(client_id)
    .bind(developer_id)
    .bind(escrow_cents)
    .bind(Uuid::now_v7()) // unique transaction_id
    .bind(agency_id)
    .bind(agency_pct)
    .execute(pool)
    .await
    .expect("insert deployments");
    id
}
