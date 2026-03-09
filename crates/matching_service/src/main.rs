mod handlers;
mod matcher;
mod orchestrator;

use anyhow::Result;
use axum::{routing::{get, post}, Router};
use dotenvy::dotenv;
use handlers::{AppState, SharedState};
use matcher::Matcher;
use orchestrator::SowOrchestrator;
use sqlx::PgPool;
use std::sync::Arc;
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

    let compliance_url = std::env::var("COMPLIANCE_SERVICE_URL")
        .unwrap_or_else(|_| "http://localhost:3006".into());

    let state: SharedState = Arc::new(AppState {
        matcher:      Matcher::new(db),
        orchestrator: SowOrchestrator::new(compliance_url),
    });

    let app = Router::new()
        .route("/health",            get(handlers::health))
        .route("/match",             post(handlers::match_talent))
        .route("/talent/:id/skills",
               get(handlers::get_talent_skills).post(handlers::upsert_skill))
        .with_state(state)
        .layer(TraceLayer::new_for_http());

    let addr = "0.0.0.0:3005";
    tracing::info!("matching-service listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
