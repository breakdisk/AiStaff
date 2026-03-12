mod consumer;
mod fanout;
mod handlers;
mod integrations;
mod prefs;

use anyhow::Result;
use axum::{
    routing::{delete, get, patch, post},
    Json, Router,
};
use consumer::NotificationConsumer;
use dotenvy::dotenv;
use fanout::{AppConfig, Fanout};
use handlers::AppState;
use lettre::{AsyncSmtpTransport, Tokio1Executor};
use serde_json::json;
use sqlx::PgPool;
use std::sync::Arc;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();
    tracing_subscriber::registry()
        .with(EnvFilter::from_default_env())
        .with(fmt::layer().json())
        .init();

    // ─────────────────────────────────────────────────────────────────────────
    // Core infrastructure env vars
    // ─────────────────────────────────────────────────────────────────────────
    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
    let brokers = std::env::var("KAFKA_BROKERS").expect("KAFKA_BROKERS");
    let smtp_host = std::env::var("SMTP_HOST").expect("SMTP_HOST");
    let smtp_from = std::env::var("SMTP_FROM").unwrap_or_else(|_| "noreply@aistaff.app".into());
    let http_port = std::env::var("NOTIFICATION_HTTP_PORT").unwrap_or_else(|_| "3012".into());

    // ─────────────────────────────────────────────────────────────────────────
    // Third-party integration config (all channels)
    // ─────────────────────────────────────────────────────────────────────────
    let config = Arc::new(AppConfig::from_env());

    // ─────────────────────────────────────────────────────────────────────────
    // Infrastructure clients
    // ─────────────────────────────────────────────────────────────────────────
    let db = PgPool::connect(&db_url).await?;
    let smtp = AsyncSmtpTransport::<Tokio1Executor>::relay(&smtp_host)?.build();

    let fanout = Arc::new(Fanout::new(db.clone(), smtp, smtp_from));

    // ─────────────────────────────────────────────────────────────────────────
    // Kafka consumer — all 9 topics
    // ─────────────────────────────────────────────────────────────────────────
    let consumer = common::kafka::consumer::KafkaConsumer::new(
        &brokers,
        "notification-service",
        &[
            // Original 4
            common::events::TOPIC_DRIFT_ALERTS,
            common::events::TOPIC_CHECKLIST_EVENTS,
            common::events::TOPIC_LICENSE_COMMANDS,
            common::events::TOPIC_DEPLOYMENT_STATUS,
            // New 5
            common::events::TOPIC_DEPLOYMENT_COMPLETE,
            common::events::TOPIC_PAYOUT_VETO,
            common::events::TOPIC_MATCH_RESULTS,
            common::events::TOPIC_WARRANTY_EVENTS,
            common::events::TOPIC_COMMUNITY_EVENTS,
        ],
    )?;

    // ─────────────────────────────────────────────────────────────────────────
    // Axum HTTP server
    // ─────────────────────────────────────────────────────────────────────────
    let state = AppState {
        db: db.clone(),
        fanout: fanout.clone(),
        config: config.clone(),
    };

    let app = Router::new()
        .route("/health", get(|| async { Json(json!({"ok": true})) }))
        .route("/notifications", get(handlers::list_notifications))
        .route("/notifications/count", get(handlers::count_unread))
        .route("/notifications/{id}/read", patch(handlers::mark_read))
        .route("/notifications/read-all", post(handlers::mark_all_read))
        .route(
            "/notification-preferences",
            get(handlers::get_prefs_handler),
        )
        .route(
            "/notification-preferences",
            post(handlers::save_prefs_handler),
        )
        .route("/device-tokens", post(handlers::register_device_token))
        .route(
            "/device-tokens/{token}",
            delete(handlers::unregister_device_token),
        )
        .route("/integrations/whatsapp/init", post(handlers::init_whatsapp))
        .route(
            "/integrations/whatsapp/webhook",
            post(handlers::whatsapp_webhook),
        )
        .route("/integrations/slack/oauth", get(handlers::slack_oauth_init))
        .route(
            "/integrations/slack/callback",
            get(handlers::slack_oauth_callback),
        )
        .route("/integrations/teams/webhook", post(handlers::save_teams))
        .route(
            "/integrations/google/oauth",
            get(handlers::google_oauth_init),
        )
        .route(
            "/integrations/google/callback",
            get(handlers::google_oauth_callback),
        )
        .route("/integrations/status", get(handlers::integration_status))
        .route(
            "/integrations/{provider}",
            delete(handlers::revoke_integration),
        )
        .layer(tower_http::cors::CorsLayer::permissive())
        .with_state(state);

    let bind_addr = format!("0.0.0.0:{http_port}");
    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    tracing::info!("notification HTTP server listening on {bind_addr}");

    // ─────────────────────────────────────────────────────────────────────────
    // Spawn tasks and wait for shutdown signal
    // ─────────────────────────────────────────────────────────────────────────
    let nc = NotificationConsumer::new(consumer, fanout);

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            tracing::error!(error=%e, "HTTP server exited");
        }
    });

    tokio::spawn(async move {
        if let Err(e) = nc.run().await {
            tracing::error!(error=%e, "Kafka consumer exited");
        }
    });

    tokio::signal::ctrl_c().await?;
    tracing::info!("shutdown signal received — exiting");

    Ok(())
}
