use anyhow::Context;
use axum::{
    routing::{delete, get, post, put},
    Router,
};
use dotenvy::dotenv;
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

mod carbon;
mod career;
mod handlers;
mod hub_service;
mod mentorship;
mod wellbeing;

pub type Db = sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Db>,
    pub kafka_brokers: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv().ok();
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::from_default_env())
        .init();

    let database_url = std::env::var("DATABASE_URL").context("DATABASE_URL not set")?;
    let kafka_brokers = std::env::var("KAFKA_BROKERS").unwrap_or_else(|_| "localhost:9092".into());

    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await
        .context("failed to connect to Postgres")?;

    let state = AppState {
        db: Arc::new(db),
        kafka_brokers,
    };

    let app = Router::new()
        // Health
        .route("/health", get(handlers::health))
        // ── Community Hubs ────────────────────────────────────────────────────
        .route("/hubs", get(handlers::list_hubs).post(handlers::create_hub))
        .route("/hubs/:hub_id", get(handlers::get_hub))
        .route("/hubs/:hub_id/join", post(handlers::join_hub))
        .route("/hubs/:hub_id/leave", delete(handlers::leave_hub))
        // ── Community Events ──────────────────────────────────────────────────
        .route(
            "/hubs/:hub_id/events",
            get(handlers::list_hub_events).post(handlers::create_hub_event),
        )
        .route("/hubs/:hub_id/events/:eid/rsvp", post(handlers::rsvp_event))
        // ── Forum Threads & Posts ─────────────────────────────────────────────
        .route(
            "/hubs/:hub_id/threads",
            get(handlers::list_threads).post(handlers::create_thread),
        )
        .route("/hubs/:hub_id/threads/:tid", get(handlers::get_thread))
        .route(
            "/hubs/:hub_id/threads/:tid/posts",
            get(handlers::list_posts).post(handlers::create_post),
        )
        // ── Mentor Profiles ───────────────────────────────────────────────────
        .route(
            "/mentors",
            get(handlers::list_mentors).post(handlers::upsert_mentor_profile),
        )
        .route("/mentors/:mentor_id", get(handlers::get_mentor))
        // ── Mentorship Pairs ──────────────────────────────────────────────────
        .route("/mentorship/request", post(handlers::request_mentorship))
        .route("/mentorship/pairs", get(handlers::list_pairs))
        .route("/mentorship/pairs/:pid", get(handlers::get_pair))
        .route(
            "/mentorship/pairs/:pid/sessions",
            get(handlers::list_sessions).post(handlers::schedule_session),
        )
        .route(
            "/mentorship/pairs/:pid/sessions/:sid/complete",
            post(handlers::complete_session),
        )
        // ── Cohorts ───────────────────────────────────────────────────────────
        .route(
            "/cohorts",
            get(handlers::list_cohorts).post(handlers::create_cohort),
        )
        .route("/cohorts/:cid/join", post(handlers::join_cohort))
        // ── Career Growth ─────────────────────────────────────────────────────
        .route("/career/:user_id", get(handlers::get_career_profile))
        .route(
            "/career/:user_id/milestones",
            get(handlers::list_milestones).post(handlers::award_milestone),
        )
        .route("/career/:user_id/gaps", get(handlers::list_skill_gaps))
        .route(
            "/career/:user_id/paths",
            get(handlers::list_learning_paths).post(handlers::assign_learning_path),
        )
        .route(
            "/career/:user_id/paths/:path_id/progress",
            put(handlers::update_path_progress),
        )
        // ── Well-Being ────────────────────────────────────────────────────────
        .route(
            "/wellbeing/:user_id/checkin",
            post(handlers::submit_checkin),
        )
        .route("/wellbeing/:user_id/checkins", get(handlers::list_checkins))
        .route(
            "/wellbeing/:user_id/burnout",
            get(handlers::get_burnout_signal),
        )
        // ── Carbon ────────────────────────────────────────────────────────────
        .route("/carbon/:user_id/log", post(handlers::log_carbon_offset))
        .route(
            "/carbon/:user_id/footprint",
            get(handlers::get_carbon_footprint),
        )
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = "0.0.0.0:3011";
    tracing::info!("community_service listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
