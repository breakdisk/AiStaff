//! marketplace_service — deployment creation + escrow command consumer.
//! HTTP on :3002 | Kafka consumer on escrow.commands

mod admin_handlers;
mod bundle_handlers;
mod change_request_handlers;
mod collab_handlers;
mod enterprise_handlers;
mod escrow_consumer;
mod handlers;
mod integration_handlers;
mod listing_media_handlers;
mod pm_consumer;
mod proposal_handlers;
mod quality_gate_handlers;

use anyhow::Result;
use axum::{
    routing::{get, post},
    Router,
};
use common::kafka::producer::KafkaProducer;
use dotenvy::dotenv;
use handlers::AppState;
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{fmt, EnvFilter};

#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();
    fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .json()
        .init();

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let brokers = std::env::var("KAFKA_BROKERS").unwrap_or_else(|_| "localhost:9092".into());

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&db_url)
        .await?;

    sqlx::migrate!("../../migrations").run(&pool).await?;

    let producer = KafkaProducer::new(&brokers)?;

    let http_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .expect("reqwest client build failed");
    let notification_url = std::env::var("NOTIFICATION_SERVICE_URL")
        .unwrap_or_else(|_| "http://localhost:3012".into());
    let admin_email = std::env::var("ADMIN_EMAIL").unwrap_or_else(|_| {
        tracing::warn!(
            "ADMIN_EMAIL not set — defaulting to admin@aistaff.app. Set this in production."
        );
        "admin@aistaff.app".into()
    });

    let state = Arc::new(AppState {
        db: pool.clone(),
        producer,
        http_client,
        notification_url,
        admin_email,
    });

    let app = Router::new()
        .route("/health", get(handlers::health))
        .route("/deployments", post(handlers::create_deployment))
        .route("/deployments/{id}", get(handlers::get_deployment))
        .route("/deployments/mine", get(handlers::list_my_deployments))
        .route(
            "/deployments/{id}/complete",
            post(handlers::complete_deployment),
        )
        .route(
            "/listings",
            get(handlers::list_listings).post(handlers::create_listing),
        )
        .route(
            "/listings/by-slug/{slug}",
            get(handlers::get_listing_by_slug),
        )
        .route("/listings/{id}", get(handlers::get_listing))
        .route(
            "/listings/{listing_id}/media",
            get(listing_media_handlers::list_listing_media)
                .post(listing_media_handlers::add_listing_media),
        )
        .route(
            "/listings/{listing_id}/media/{media_id}",
            axum::routing::delete(listing_media_handlers::delete_listing_media),
        )
        .route("/skill-tags", get(handlers::get_skill_tags))
        .route(
            "/talent-skills/{id}",
            get(handlers::get_talent_skills).put(handlers::put_talent_skills),
        )
        .route("/express-interest", post(handlers::express_interest))
        .route("/talent-skills/{id}/attest", post(handlers::attest_skills))
        .route(
            "/listings/{listing_id}/proposals",
            get(proposal_handlers::list_proposals_for_job),
        )
        .route(
            "/proposals/{proposal_id}/accept",
            post(proposal_handlers::accept_proposal),
        )
        .route(
            "/proposals/{proposal_id}/reject",
            post(proposal_handlers::reject_proposal),
        )
        // Admin listing/deployment/revenue (internal only)
        .route("/admin/listings", get(admin_handlers::list_listings))
        .route(
            "/admin/listings/{id}/approve",
            post(admin_handlers::approve_listing),
        )
        .route(
            "/admin/listings/{id}/reject",
            post(admin_handlers::reject_listing),
        )
        .route("/admin/deployments", get(admin_handlers::list_deployments))
        .route("/admin/revenue", get(admin_handlers::revenue_summary))
        .route(
            "/admin/payouts/{id}/force-release",
            post(admin_handlers::force_release_payout),
        )
        // Bundle management
        .route(
            "/enterprise/orgs/{id}/bundles",
            get(bundle_handlers::list_org_bundles).post(bundle_handlers::create_bundle),
        )
        .route(
            "/enterprise/orgs/{id}/bundles/{bundle_id}",
            axum::routing::patch(bundle_handlers::update_bundle)
                .delete(bundle_handlers::delete_bundle),
        )
        // Admin bundle moderation
        .route("/admin/bundles", get(bundle_handlers::admin_list_bundles))
        .route(
            "/admin/bundles/{id}/approve",
            post(bundle_handlers::admin_approve_bundle),
        )
        .route(
            "/admin/bundles/{id}/reject",
            post(bundle_handlers::admin_reject_bundle),
        )
        .route(
            "/enterprise/orgs/{id}/proposals",
            get(proposal_handlers::list_org_proposals),
        )
        .route(
            "/enterprise/orgs/{id}/deployments",
            get(enterprise_handlers::list_org_deployments),
        )
        .route(
            "/enterprise/orgs/{id}/analytics",
            get(enterprise_handlers::org_analytics),
        )
        .route(
            "/collab/messages",
            get(collab_handlers::list_messages).post(collab_handlers::post_message),
        )
        .route("/collab/read", post(collab_handlers::mark_read))
        .route("/collab/unread", get(collab_handlers::unread_count))
        .route(
            "/collab/messages/{id}",
            axum::routing::patch(collab_handlers::edit_message)
                .delete(collab_handlers::delete_message),
        )
        .route("/collab/reactions", post(collab_handlers::toggle_reaction))
        .route(
            "/collab/messages/{id}/thread",
            get(collab_handlers::list_thread),
        )
        .route("/collab/files", post(collab_handlers::upload_file))
        .route("/collab/files/{slug}", get(collab_handlers::serve_file))
        .route(
            "/integrations",
            get(integration_handlers::list_integrations)
                .post(integration_handlers::create_integration),
        )
        .route(
            "/integrations/events",
            post(integration_handlers::create_event),
        )
        .route(
            "/integrations/by-external-id",
            get(integration_handlers::get_by_external_id),
        )
        .route(
            "/quality-gate/scans",
            get(quality_gate_handlers::list_scans).post(quality_gate_handlers::create_scan),
        )
        .route(
            "/quality-gate/scans/{id}/status",
            axum::routing::patch(quality_gate_handlers::update_scan_status),
        )
        .route(
            "/quality-gate/scans/{id}/issues",
            post(quality_gate_handlers::bulk_insert_issues),
        )
        // Change requests (scope drift → approved new scope + escrow bump)
        .route(
            "/change-requests",
            get(change_request_handlers::list_change_requests)
                .post(change_request_handlers::create_change_request),
        )
        .route(
            "/change-requests/{id}/respond",
            axum::routing::patch(change_request_handlers::respond_change_request),
        )
        .with_state(state)
        .layer(TraceLayer::new_for_http());

    let addr = "0.0.0.0:3002";
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("marketplace_service HTTP on {addr}");

    // PM event consumer — secondary, must not kill the HTTP server or escrow consumer.
    {
        let pool_pm    = pool.clone();
        let brokers_pm = brokers.clone();
        tokio::spawn(async move {
            loop {
                if let Err(e) = pm_consumer::run_pm_event_consumer(pool_pm.clone(), brokers_pm.clone()).await {
                    tracing::error!("PM event consumer exited: {e:#} — restarting in 5s");
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                }
            }
        });
    }

    tokio::try_join!(
        escrow_consumer::run_escrow_consumer(pool, brokers),
        async move {
            axum::serve(listener, app)
                .await
                .map_err(anyhow::Error::from)
        },
    )?;

    Ok(())
}
