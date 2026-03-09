mod handlers;
mod roi;

use anyhow::Result;
use axum::{routing::get, Router};
use dotenvy::dotenv;
use sqlx::PgPool;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();
    tracing_subscriber::registry()
        .with(EnvFilter::from_default_env())
        .with(fmt::layer().json())
        .init();

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
    let db     = PgPool::connect(&db_url).await?;

    let app = Router::new()
        .route("/health",                    get(handlers::health))
        .route("/analytics/talent/:id/roi",  get(handlers::talent_roi))
        .route("/analytics/leaderboard",     get(handlers::leaderboard))
        .with_state(db)
        .layer(TraceLayer::new_for_http());

    let addr = "0.0.0.0:3008";
    tracing::info!("analytics-service listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
