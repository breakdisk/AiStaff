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
use lettre::{
    transport::smtp::authentication::Credentials, AsyncSmtpTransport, Tokio1Executor,
};
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
    let smtp_port: u16 = std::env::var("SMTP_PORT")
        .unwrap_or_else(|_| "587".into())
        .parse()
        .unwrap_or(587);
    let smtp_username = std::env::var("SMTP_USERNAME").unwrap_or_default();
    let smtp_password = std::env::var("SMTP_PASSWORD").unwrap_or_default();

    // ─────────────────────────────────────────────────────────────────────────
    // Third-party integration config (all channels)
    // ─────────────────────────────────────────────────────────────────────────
    let config = Arc::new(AppConfig::from_env());

    // ─────────────────────────────────────────────────────────────────────────
    // Infrastructure clients
    // ─────────────────────────────────────────────────────────────────────────
    let db = PgPool::connect(&db_url).await?;

    // Build SMTP transport. Port 465 uses implicit TLS (relay); all other ports
    // (587 is the SES default) use STARTTLS. Credentials are optional for dev
    // (Mailhog accepts anonymous) but required for SES and most production SMTP.
    let smtp = {
        let mut builder = if smtp_port == 465 {
            AsyncSmtpTransport::<Tokio1Executor>::relay(&smtp_host)?
        } else {
            AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&smtp_host)?
        };
        if !smtp_username.is_empty() && !smtp_password.is_empty() {
            builder = builder.credentials(Credentials::new(smtp_username, smtp_password));
        }
        builder.build()
    };

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
            common::events::TOPIC_MESSAGE_SENT,
            common::events::TOPIC_DEPLOYMENT_STARTED,
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
        .route("/integrations/messenger/init",    post(handlers::init_messenger))
        .route("/integrations/messenger/webhook", post(handlers::messenger_webhook))
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
    let poll_fanout = fanout.clone(); // Arc clone — needed for polling loop
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

    tokio::spawn(async move {
        use std::time::Duration;
        use sqlx::Row;
        let mut ticker = tokio::time::interval(Duration::from_secs(60));
        loop {
            ticker.tick().await;

            // Atomically claim all due reminders — UPDATE ... RETURNING prevents double-fire.
            let due = match sqlx::query(
                "UPDATE reminders SET fired = true
                 WHERE fired = false AND remind_at <= NOW()
                 RETURNING id, user_id, title",
            )
            .fetch_all(&poll_fanout.db)
            .await
            {
                Ok(rows) => rows,
                Err(e) => {
                    tracing::error!("reminders poll error: {e}");
                    continue;
                }
            };

            for r in &due {
                let Ok(user_id) = r.try_get::<uuid::Uuid, _>("user_id") else { continue };
                let Ok(title) = r.try_get::<String, _>("title") else { continue };

                // Look up email — best-effort; skip email if not found.
                let email: Option<String> = sqlx::query(
                    "SELECT email FROM unified_profiles WHERE id = $1",
                )
                .bind(user_id)
                .fetch_optional(&poll_fanout.db)
                .await
                .ok()
                .flatten()
                .and_then(|row| row.try_get::<String, _>("email").ok());

                poll_fanout
                    .dispatch_in_app(user_id, &title, "Your reminder is due.", "reminder", "normal")
                    .await
                    .unwrap_or_else(|e| tracing::error!("in_app dispatch error: {e}"));

                if let Some(addr) = email {
                    if !addr.is_empty() {
                        poll_fanout
                            .dispatch_email(user_id, &addr, &title, "Your reminder is due.")
                            .await
                            .unwrap_or_else(|e| tracing::error!("email dispatch error: {e}"));
                    }
                }
            }

            if !due.is_empty() {
                tracing::info!(count = due.len(), "reminders fired");
            }
        }
    });

    tokio::signal::ctrl_c().await?;
    tracing::info!("shutdown signal received — exiting");

    Ok(())
}
