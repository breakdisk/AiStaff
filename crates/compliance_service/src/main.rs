mod contracts;
mod handlers;

use anyhow::Result;
use axum::{routing::get, routing::post, Router};
use contracts::ContractService;
use dotenvy::dotenv;
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
    let db = PgPool::connect(&db_url).await?;
    let svc = Arc::new(ContractService::new(db));

    let app = Router::new()
        .route("/health", get(handlers::health))
        .route("/contracts", post(handlers::create_contract))
        .route("/contracts/{id}", get(handlers::get_contract))
        .route("/contracts/{id}/sign", post(handlers::sign_contract))
        .route("/warranty-claims", get(handlers::list_warranty_claims))
        .route(
            "/warranty-claims/{id}/resolve",
            post(handlers::resolve_warranty_claim),
        )
        .with_state(svc)
        .layer(TraceLayer::new_for_http());

    let addr = "0.0.0.0:3006";
    tracing::info!("compliance-service listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
