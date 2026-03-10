use anyhow::Result;
use common::events::{CohortCreated, EventEnvelope, MentorshipPaired, TOPIC_COMMUNITY_EVENTS};
use rdkafka::config::ClientConfig;
use rdkafka::producer::{FutureProducer, FutureRecord};
use serde_json::Value;
use std::time::Duration;
use uuid::Uuid;

use crate::{
    handlers::{
        CreateCohortRequest, MentorshipRequestBody, ScheduleSessionRequest, UpsertMentorRequest,
    },
    Db,
};

// ── Mentor profiles ───────────────────────────────────────────────────────────

pub async fn list_mentors(db: &Db) -> Result<Vec<Value>> {
    let rows = sqlx::query!(
        r#"SELECT mp.id, mp.user_id, mp.bio, mp.specializations, mp.max_mentees,
                  mp.current_mentees, mp.availability_tz, mp.accepting_requests,
                  mp.session_rate_cents, mp.created_at
           FROM mentor_profiles mp
           WHERE mp.accepting_requests = true
           ORDER BY mp.current_mentees ASC, mp.created_at DESC"#
    )
    .fetch_all(db)
    .await?
    .into_iter()
    .map(|r| {
        serde_json::json!({
            "id": r.id, "user_id": r.user_id, "bio": r.bio,
            "specializations": r.specializations, "max_mentees": r.max_mentees,
            "current_mentees": r.current_mentees, "availability_tz": r.availability_tz,
            "accepting_requests": r.accepting_requests,
            "session_rate_cents": r.session_rate_cents, "created_at": r.created_at,
        })
    })
    .collect();
    Ok(rows)
}

pub async fn get_mentor(db: &Db, mentor_id: Uuid) -> Result<Option<Value>> {
    let row = sqlx::query!(
        r#"SELECT id, user_id, bio, specializations, max_mentees, current_mentees,
                  availability_tz, accepting_requests, session_rate_cents, created_at
           FROM mentor_profiles WHERE user_id = $1"#,
        mentor_id
    )
    .fetch_optional(db)
    .await?;

    Ok(row.map(|r| {
        serde_json::json!({
            "id": r.id, "user_id": r.user_id, "bio": r.bio,
            "specializations": r.specializations, "max_mentees": r.max_mentees,
            "current_mentees": r.current_mentees, "availability_tz": r.availability_tz,
            "accepting_requests": r.accepting_requests,
            "session_rate_cents": r.session_rate_cents, "created_at": r.created_at,
        })
    }))
}

pub async fn upsert_mentor_profile(db: &Db, req: UpsertMentorRequest) -> Result<()> {
    sqlx::query!(
        r#"INSERT INTO mentor_profiles
               (user_id, bio, specializations, max_mentees, availability_tz,
                accepting_requests, session_rate_cents)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (user_id) DO UPDATE SET
               bio                = EXCLUDED.bio,
               specializations    = EXCLUDED.specializations,
               max_mentees        = EXCLUDED.max_mentees,
               availability_tz    = EXCLUDED.availability_tz,
               accepting_requests = EXCLUDED.accepting_requests,
               session_rate_cents = EXCLUDED.session_rate_cents"#,
        req.user_id,
        req.bio.as_deref().unwrap_or(""),
        &req.specializations,
        req.max_mentees.unwrap_or(3),
        req.availability_tz.as_deref().unwrap_or("UTC"),
        req.accepting_requests.unwrap_or(true),
        req.session_rate_cents.unwrap_or(0),
    )
    .execute(db)
    .await?;
    Ok(())
}

// ── Mentorship Pairs ──────────────────────────────────────────────────────────

pub async fn request_mentorship(
    db: &Db,
    kafka_brokers: &str,
    req: MentorshipRequestBody,
) -> Result<Uuid> {
    let pair_id = sqlx::query_scalar!(
        r#"INSERT INTO mentorship_pairs (mentor_id, mentee_id, goal, status)
           VALUES ($1, $2, $3, 'pending')
           RETURNING id"#,
        req.mentor_id,
        req.mentee_id,
        req.goal.as_deref().unwrap_or(""),
    )
    .fetch_one(db)
    .await?;

    // Increment mentor's current_mentees count
    sqlx::query!(
        "UPDATE mentor_profiles SET current_mentees = current_mentees + 1 WHERE user_id = $1",
        req.mentor_id
    )
    .execute(db)
    .await?;

    // Emit Kafka event
    emit_event(
        kafka_brokers,
        TOPIC_COMMUNITY_EVENTS,
        &EventEnvelope::new(
            "MentorshipPaired",
            &MentorshipPaired {
                pair_id,
                mentor_id: req.mentor_id,
                mentee_id: req.mentee_id,
            },
        ),
    )
    .await;

    Ok(pair_id)
}

pub async fn list_pairs(db: &Db, user_id: Option<Uuid>) -> Result<Vec<Value>> {
    let rows = if let Some(uid) = user_id {
        sqlx::query!(
            r#"SELECT id, mentor_id, mentee_id, status, goal, started_at, completed_at
               FROM mentorship_pairs
               WHERE mentor_id = $1 OR mentee_id = $1
               ORDER BY started_at DESC"#,
            uid
        )
        .fetch_all(db)
        .await?
        .into_iter()
        .map(|r| {
            serde_json::json!({
                "id": r.id, "mentor_id": r.mentor_id, "mentee_id": r.mentee_id,
                "status": r.status, "goal": r.goal, "started_at": r.started_at,
                "completed_at": r.completed_at,
            })
        })
        .collect()
    } else {
        sqlx::query!(
            "SELECT id, mentor_id, mentee_id, status, goal, started_at, completed_at
             FROM mentorship_pairs ORDER BY started_at DESC LIMIT 100"
        )
        .fetch_all(db)
        .await?
        .into_iter()
        .map(|r| {
            serde_json::json!({
                "id": r.id, "mentor_id": r.mentor_id, "mentee_id": r.mentee_id,
                "status": r.status, "goal": r.goal, "started_at": r.started_at,
                "completed_at": r.completed_at,
            })
        })
        .collect()
    };
    Ok(rows)
}

pub async fn get_pair(db: &Db, pair_id: Uuid) -> Result<Option<Value>> {
    let row = sqlx::query!(
        "SELECT id, mentor_id, mentee_id, status, goal, started_at, completed_at
         FROM mentorship_pairs WHERE id = $1",
        pair_id
    )
    .fetch_optional(db)
    .await?;
    Ok(row.map(|r| {
        serde_json::json!({
            "id": r.id, "mentor_id": r.mentor_id, "mentee_id": r.mentee_id,
            "status": r.status, "goal": r.goal, "started_at": r.started_at,
            "completed_at": r.completed_at,
        })
    }))
}

// ── Sessions ──────────────────────────────────────────────────────────────────

pub async fn list_sessions(db: &Db, pair_id: Uuid) -> Result<Vec<Value>> {
    let rows = sqlx::query!(
        "SELECT id, scheduled_at, duration_min, notes, status, rating, created_at
         FROM mentorship_sessions WHERE pair_id = $1 ORDER BY scheduled_at ASC",
        pair_id
    )
    .fetch_all(db)
    .await?
    .into_iter()
    .map(|r| {
        serde_json::json!({
            "id": r.id, "scheduled_at": r.scheduled_at, "duration_min": r.duration_min,
            "notes": r.notes, "status": r.status, "rating": r.rating, "created_at": r.created_at,
        })
    })
    .collect();
    Ok(rows)
}

pub async fn schedule_session(db: &Db, pair_id: Uuid, req: ScheduleSessionRequest) -> Result<Uuid> {
    let id = sqlx::query_scalar!(
        "INSERT INTO mentorship_sessions (pair_id, scheduled_at, duration_min) VALUES ($1, $2, $3) RETURNING id",
        pair_id,
        req.scheduled_at,
        req.duration_min.unwrap_or(60),
    )
    .fetch_one(db)
    .await?;
    Ok(id)
}

pub async fn complete_session(db: &Db, session_id: Uuid, rating: Option<i16>) -> Result<()> {
    sqlx::query!(
        "UPDATE mentorship_sessions SET status = 'completed', rating = $2 WHERE id = $1",
        session_id,
        rating
    )
    .execute(db)
    .await?;
    Ok(())
}

// ── Cohorts ───────────────────────────────────────────────────────────────────

pub async fn list_cohorts(db: &Db) -> Result<Vec<Value>> {
    let rows = sqlx::query!(
        r#"SELECT id, name, description, cohort_type, max_members, member_count,
                  facilitator_id, starts_at, ends_at, created_at
           FROM cohort_groups ORDER BY created_at DESC LIMIT 50"#
    )
    .fetch_all(db)
    .await?
    .into_iter()
    .map(|r| {
        serde_json::json!({
            "id": r.id, "name": r.name, "description": r.description,
            "cohort_type": r.cohort_type, "max_members": r.max_members,
            "member_count": r.member_count, "facilitator_id": r.facilitator_id,
            "starts_at": r.starts_at, "ends_at": r.ends_at, "created_at": r.created_at,
        })
    })
    .collect();
    Ok(rows)
}

pub async fn create_cohort(db: &Db, kafka_brokers: &str, req: CreateCohortRequest) -> Result<Uuid> {
    let cohort_id = sqlx::query_scalar!(
        r#"INSERT INTO cohort_groups (name, description, cohort_type, max_members, facilitator_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING id"#,
        req.name,
        req.description.as_deref().unwrap_or(""),
        req.cohort_type.as_deref().unwrap_or("general"),
        req.max_members.unwrap_or(20),
        req.facilitator_id,
    )
    .fetch_one(db)
    .await?;

    emit_event(
        kafka_brokers,
        TOPIC_COMMUNITY_EVENTS,
        &EventEnvelope::new(
            "CohortCreated",
            &CohortCreated {
                cohort_id,
                name: req.name,
                cohort_type: req.cohort_type.unwrap_or_else(|| "general".into()),
            },
        ),
    )
    .await;

    Ok(cohort_id)
}

pub async fn join_cohort(db: &Db, cohort_id: Uuid, user_id: Uuid) -> Result<()> {
    sqlx::query!(
        "INSERT INTO cohort_members (cohort_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        cohort_id,
        user_id
    )
    .execute(db)
    .await?;
    sqlx::query!(
        "UPDATE cohort_groups SET member_count = member_count + 1 WHERE id = $1",
        cohort_id
    )
    .execute(db)
    .await?;
    Ok(())
}

// ── Kafka helper ──────────────────────────────────────────────────────────────

async fn emit_event(brokers: &str, topic: &str, envelope: &EventEnvelope) {
    let producer: FutureProducer = match ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("message.timeout.ms", "5000")
        .create()
    {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!("kafka producer init failed: {e}");
            return;
        }
    };
    let payload = serde_json::to_string(envelope).unwrap_or_default();
    let record = FutureRecord::to(topic).payload(&payload).key("community");
    if let Err((e, _)) = producer.send(record, Duration::from_secs(5)).await {
        tracing::warn!("kafka emit failed: {e}");
    }
}
