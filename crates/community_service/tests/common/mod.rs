use community_service::AppState;
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use testcontainers::runners::AsyncRunner;
use testcontainers::ContainerAsync;
use testcontainers_modules::postgres::Postgres;
use uuid::Uuid;

/// Shared test fixture: holds a live Postgres container + connection pool.
/// Drop order matters: the pool must be dropped before the container.
pub struct TestContext {
    pub state: AppState,
    _container: ContainerAsync<Postgres>,
}

impl TestContext {
    pub async fn new() -> Self {
        let container = Postgres::default()
            .start()
            .await
            .expect("postgres testcontainer start");

        let port = container
            .get_host_port_ipv4(5432)
            .await
            .expect("get postgres port");

        let url = format!("postgres://postgres:postgres@127.0.0.1:{port}/postgres");

        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(&url)
            .await
            .expect("connect to test postgres");

        sqlx::migrate!("../../migrations")
            .run(&pool)
            .await
            .expect("run migrations");

        TestContext {
            state: AppState {
                db: Arc::new(pool),
                // Kafka broker won't be reachable in tests; emit_event is best-effort
                // and logs a warning rather than failing.
                kafka_brokers: "127.0.0.1:19092".into(),
            },
            _container: container,
        }
    }

    pub fn db(&self) -> &sqlx::PgPool {
        &self.state.db
    }

    /// Insert a minimal unified_profiles row and return its UUID.
    pub async fn new_user(&self) -> Uuid {
        let uid = Uuid::new_v4();
        sqlx::query_scalar::<_, Uuid>(
            "INSERT INTO unified_profiles (github_uid, display_name, email) \
             VALUES ($1, $2, $3) RETURNING id",
        )
        .bind(format!("gh_{uid}"))
        .bind(format!("Test User {uid}"))
        .bind(format!("{uid}@test.invalid"))
        .fetch_one(self.db())
        .await
        .expect("new_user insert")
    }
}
