use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::AppState;
use crate::{career, carbon, hub_service, mentorship, wellbeing};

// ── Health ────────────────────────────────────────────────────────────────────

pub async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

// ── Hub handlers ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct HubQuery {
    pub category: Option<String>,
    pub limit:    Option<i64>,
}

pub async fn list_hubs(
    State(s): State<AppState>,
    Query(q): Query<HubQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    hub_service::list_hubs(&s.db, q.category.as_deref(), q.limit.unwrap_or(50))
        .await
        .map(|rows| Json(serde_json::json!({ "hubs": rows })))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

#[derive(Deserialize)]
pub struct CreateHubRequest {
    pub owner_id:    Uuid,
    pub slug:        String,
    pub name:        String,
    pub description: Option<String>,
    pub category:    Option<String>,
    pub timezone:    Option<String>,
    pub is_private:  Option<bool>,
}

pub async fn create_hub(
    State(s): State<AppState>,
    Json(body): Json<CreateHubRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), StatusCode> {
    hub_service::create_hub(&s.db, body)
        .await
        .map(|id| (StatusCode::CREATED, Json(serde_json::json!({ "hub_id": id }))))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

pub async fn get_hub(
    State(s): State<AppState>,
    Path(hub_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    hub_service::get_hub(&s.db, hub_id)
        .await
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })?
        .map(|h| Json(h))
        .ok_or(StatusCode::NOT_FOUND)
}

#[derive(Deserialize)]
pub struct JoinHubRequest { pub user_id: Uuid }

pub async fn join_hub(
    State(s): State<AppState>,
    Path(hub_id): Path<Uuid>,
    Json(body): Json<JoinHubRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    hub_service::join_hub(&s.db, hub_id, body.user_id)
        .await
        .map(|_| Json(serde_json::json!({ "ok": true })))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

pub async fn leave_hub(
    State(s): State<AppState>,
    Path(hub_id): Path<Uuid>,
    Json(body): Json<JoinHubRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    hub_service::leave_hub(&s.db, hub_id, body.user_id)
        .await
        .map(|_| Json(serde_json::json!({ "ok": true })))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

// ── Community Events ──────────────────────────────────────────────────────────

pub async fn list_hub_events(
    State(s): State<AppState>,
    Path(hub_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    hub_service::list_hub_events(&s.db, hub_id)
        .await
        .map(|rows| Json(serde_json::json!({ "events": rows })))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

#[derive(Deserialize)]
pub struct CreateEventRequest {
    pub organizer_id:   Uuid,
    pub title:          String,
    pub description:    Option<String>,
    pub event_type:     Option<String>,
    pub timezone:       Option<String>,
    pub starts_at:      chrono::DateTime<chrono::Utc>,
    pub ends_at:        chrono::DateTime<chrono::Utc>,
    pub max_attendees:  Option<i32>,
    pub meeting_url:    Option<String>,
}

pub async fn create_hub_event(
    State(s): State<AppState>,
    Path(hub_id): Path<Uuid>,
    Json(body): Json<CreateEventRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), StatusCode> {
    hub_service::create_hub_event(&s.db, hub_id, body)
        .await
        .map(|id| (StatusCode::CREATED, Json(serde_json::json!({ "event_id": id }))))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

#[derive(Deserialize)]
pub struct RsvpRequest { pub user_id: Uuid }

pub async fn rsvp_event(
    State(s): State<AppState>,
    Path((hub_id, event_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<RsvpRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let _ = hub_id; // event belongs to hub; hub_id is for route coherence
    hub_service::rsvp_event(&s.db, event_id, body.user_id)
        .await
        .map(|_| Json(serde_json::json!({ "ok": true })))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

// ── Forum ─────────────────────────────────────────────────────────────────────

pub async fn list_threads(
    State(s): State<AppState>,
    Path(hub_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    hub_service::list_threads(&s.db, hub_id)
        .await
        .map(|rows| Json(serde_json::json!({ "threads": rows })))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

#[derive(Deserialize)]
pub struct CreateThreadRequest {
    pub author_id: Uuid,
    pub title:     String,
    pub body:      String,
}

pub async fn create_thread(
    State(s): State<AppState>,
    Path(hub_id): Path<Uuid>,
    Json(body): Json<CreateThreadRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), StatusCode> {
    hub_service::create_thread(&s.db, hub_id, body)
        .await
        .map(|id| (StatusCode::CREATED, Json(serde_json::json!({ "thread_id": id }))))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

pub async fn get_thread(
    State(s): State<AppState>,
    Path((hub_id, thread_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let _ = hub_id;
    hub_service::get_thread(&s.db, thread_id)
        .await
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })?
        .map(|t| Json(t))
        .ok_or(StatusCode::NOT_FOUND)
}

pub async fn list_posts(
    State(s): State<AppState>,
    Path((_, thread_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    hub_service::list_posts(&s.db, thread_id)
        .await
        .map(|rows| Json(serde_json::json!({ "posts": rows })))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

#[derive(Deserialize)]
pub struct CreatePostRequest {
    pub author_id: Uuid,
    pub body:      String,
}

pub async fn create_post(
    State(s): State<AppState>,
    Path((_, thread_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<CreatePostRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), StatusCode> {
    hub_service::create_post(&s.db, thread_id, body)
        .await
        .map(|id| (StatusCode::CREATED, Json(serde_json::json!({ "post_id": id }))))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

// ── Mentor / Mentorship handlers ──────────────────────────────────────────────

pub async fn list_mentors(
    State(s): State<AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    mentorship::list_mentors(&s.db)
        .await
        .map(|rows| Json(serde_json::json!({ "mentors": rows })))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

pub async fn get_mentor(
    State(s): State<AppState>,
    Path(mentor_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    mentorship::get_mentor(&s.db, mentor_id)
        .await
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })?
        .map(|m| Json(m))
        .ok_or(StatusCode::NOT_FOUND)
}

#[derive(Deserialize)]
pub struct UpsertMentorRequest {
    pub user_id:            Uuid,
    pub bio:                Option<String>,
    pub specializations:    Vec<String>,
    pub max_mentees:        Option<i32>,
    pub availability_tz:    Option<String>,
    pub accepting_requests: Option<bool>,
    pub session_rate_cents: Option<i32>,
}

pub async fn upsert_mentor_profile(
    State(s): State<AppState>,
    Json(body): Json<UpsertMentorRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    mentorship::upsert_mentor_profile(&s.db, body)
        .await
        .map(|_| Json(serde_json::json!({ "ok": true })))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

#[derive(Deserialize)]
pub struct MentorshipRequestBody {
    pub mentor_id: Uuid,
    pub mentee_id: Uuid,
    pub goal:      Option<String>,
}

pub async fn request_mentorship(
    State(s): State<AppState>,
    Json(body): Json<MentorshipRequestBody>,
) -> Result<(StatusCode, Json<serde_json::Value>), StatusCode> {
    mentorship::request_mentorship(&s.db, &s.kafka_brokers, body)
        .await
        .map(|id| (StatusCode::CREATED, Json(serde_json::json!({ "pair_id": id }))))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

pub async fn list_pairs(
    State(s): State<AppState>,
    Query(q): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let user_id = q.get("user_id")
        .and_then(|v| Uuid::parse_str(v).ok());
    mentorship::list_pairs(&s.db, user_id)
        .await
        .map(|rows| Json(serde_json::json!({ "pairs": rows })))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

pub async fn get_pair(
    State(s): State<AppState>,
    Path(pair_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    mentorship::get_pair(&s.db, pair_id)
        .await
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })?
        .map(|p| Json(p))
        .ok_or(StatusCode::NOT_FOUND)
}

pub async fn list_sessions(
    State(s): State<AppState>,
    Path(pair_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    mentorship::list_sessions(&s.db, pair_id)
        .await
        .map(|rows| Json(serde_json::json!({ "sessions": rows })))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

#[derive(Deserialize)]
pub struct ScheduleSessionRequest {
    pub scheduled_at:  chrono::DateTime<chrono::Utc>,
    pub duration_min:  Option<i32>,
}

pub async fn schedule_session(
    State(s): State<AppState>,
    Path(pair_id): Path<Uuid>,
    Json(body): Json<ScheduleSessionRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), StatusCode> {
    mentorship::schedule_session(&s.db, pair_id, body)
        .await
        .map(|id| (StatusCode::CREATED, Json(serde_json::json!({ "session_id": id }))))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

#[derive(Deserialize)]
pub struct CompleteSessionRequest { pub rating: Option<i16> }

pub async fn complete_session(
    State(s): State<AppState>,
    Path((pair_id, session_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<CompleteSessionRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let _ = pair_id;
    mentorship::complete_session(&s.db, session_id, body.rating)
        .await
        .map(|_| Json(serde_json::json!({ "ok": true })))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

pub async fn list_cohorts(
    State(s): State<AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    mentorship::list_cohorts(&s.db)
        .await
        .map(|rows| Json(serde_json::json!({ "cohorts": rows })))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

#[derive(Deserialize)]
pub struct CreateCohortRequest {
    pub name:           String,
    pub description:    Option<String>,
    pub cohort_type:    Option<String>,
    pub max_members:    Option<i32>,
    pub facilitator_id: Option<Uuid>,
}

pub async fn create_cohort(
    State(s): State<AppState>,
    Json(body): Json<CreateCohortRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), StatusCode> {
    mentorship::create_cohort(&s.db, &s.kafka_brokers, body)
        .await
        .map(|id| (StatusCode::CREATED, Json(serde_json::json!({ "cohort_id": id }))))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

#[derive(Deserialize)]
pub struct JoinCohortRequest { pub user_id: Uuid }

pub async fn join_cohort(
    State(s): State<AppState>,
    Path(cohort_id): Path<Uuid>,
    Json(body): Json<JoinCohortRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    mentorship::join_cohort(&s.db, cohort_id, body.user_id)
        .await
        .map(|_| Json(serde_json::json!({ "ok": true })))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

// ── Career Growth handlers ────────────────────────────────────────────────────

pub async fn get_career_profile(
    State(s): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    career::get_career_profile(&s.db, user_id)
        .await
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })?
        .map(|p| Json(p))
        .ok_or(StatusCode::NOT_FOUND)
}

pub async fn list_milestones(
    State(s): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    career::list_milestones(&s.db, user_id)
        .await
        .map(|rows| Json(serde_json::json!({ "milestones": rows })))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

#[derive(Deserialize)]
pub struct AwardMilestoneRequest {
    pub milestone_key: String,
    pub label:         String,
    pub xp_awarded:    Option<i32>,
}

pub async fn award_milestone(
    State(s): State<AppState>,
    Path(user_id): Path<Uuid>,
    Json(body): Json<AwardMilestoneRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), StatusCode> {
    career::award_milestone(&s.db, &s.kafka_brokers, user_id, body)
        .await
        .map(|id| (StatusCode::CREATED, Json(serde_json::json!({ "milestone_id": id }))))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

pub async fn list_skill_gaps(
    State(s): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    career::list_skill_gaps(&s.db, user_id)
        .await
        .map(|rows| Json(serde_json::json!({ "gaps": rows })))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

pub async fn list_learning_paths(
    State(s): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    career::list_learning_paths(&s.db, user_id)
        .await
        .map(|rows| Json(serde_json::json!({ "paths": rows })))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

#[derive(Deserialize)]
pub struct AssignPathRequest {
    pub title:        String,
    pub description:  Option<String>,
    pub skill_target: String,
    pub steps:        serde_json::Value,
}

pub async fn assign_learning_path(
    State(s): State<AppState>,
    Path(user_id): Path<Uuid>,
    Json(body): Json<AssignPathRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), StatusCode> {
    career::assign_learning_path(&s.db, &s.kafka_brokers, user_id, body)
        .await
        .map(|id| (StatusCode::CREATED, Json(serde_json::json!({ "path_id": id }))))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

#[derive(Deserialize)]
pub struct UpdateProgressRequest { pub progress_pct: i16 }

pub async fn update_path_progress(
    State(s): State<AppState>,
    Path((user_id, path_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateProgressRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let _ = user_id;
    career::update_path_progress(&s.db, path_id, body.progress_pct)
        .await
        .map(|_| Json(serde_json::json!({ "ok": true })))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

// ── Well-Being handlers ───────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CheckinRequest {
    pub mood_score:   i16,
    pub energy_score: i16,
    pub stress_score: i16,
    pub notes:        Option<String>,
}

pub async fn submit_checkin(
    State(s): State<AppState>,
    Path(user_id): Path<Uuid>,
    Json(body): Json<CheckinRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), StatusCode> {
    wellbeing::submit_checkin(&s.db, &s.kafka_brokers, user_id, body)
        .await
        .map(|id| (StatusCode::CREATED, Json(serde_json::json!({ "checkin_id": id }))))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

pub async fn list_checkins(
    State(s): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    wellbeing::list_checkins(&s.db, user_id)
        .await
        .map(|rows| Json(serde_json::json!({ "checkins": rows })))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

pub async fn get_burnout_signal(
    State(s): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    wellbeing::get_burnout_signal(&s.db, user_id)
        .await
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })?
        .map(|b| Json(b))
        .ok_or(StatusCode::NOT_FOUND)
}

// ── Carbon handlers ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct LogOffsetRequest {
    pub offset_kg:      f64,
    pub activity_type:  Option<String>,
    pub provider:       Option<String>,
    pub certificate_url: Option<String>,
}

pub async fn log_carbon_offset(
    State(s): State<AppState>,
    Path(user_id): Path<Uuid>,
    Json(body): Json<LogOffsetRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), StatusCode> {
    carbon::log_carbon_offset(&s.db, &s.kafka_brokers, user_id, body)
        .await
        .map(|id| (StatusCode::CREATED, Json(serde_json::json!({ "offset_id": id }))))
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })
}

pub async fn get_carbon_footprint(
    State(s): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    carbon::get_carbon_footprint(&s.db, user_id)
        .await
        .map_err(|e| { tracing::error!("{e:#}"); StatusCode::INTERNAL_SERVER_ERROR })?
        .map(|f| Json(f))
        .ok_or(StatusCode::NOT_FOUND)
}
