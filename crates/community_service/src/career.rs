use anyhow::Result;
use common::events::{
    CareerMilestoneReached, EventEnvelope, LearningPathAssigned, TOPIC_COMMUNITY_EVENTS,
};
use rdkafka::config::ClientConfig;
use rdkafka::producer::{FutureProducer, FutureRecord};
use serde_json::Value;
use std::time::Duration;
use uuid::Uuid;

use crate::{
    handlers::{AssignPathRequest, AwardMilestoneRequest},
    Db,
};

pub async fn get_career_profile(db: &Db, user_id: Uuid) -> Result<Option<Value>> {
    let row = sqlx::query!(
        r#"SELECT id, user_id, current_tier, target_role, bio, total_xp, milestone_count, created_at, updated_at
           FROM career_profiles WHERE user_id = $1"#,
        user_id
    )
    .fetch_optional(db)
    .await?;

    Ok(row.map(|r| {
        serde_json::json!({
            "id": r.id, "user_id": r.user_id, "current_tier": r.current_tier,
            "target_role": r.target_role, "bio": r.bio,
            "total_xp": r.total_xp, "milestone_count": r.milestone_count,
            "created_at": r.created_at, "updated_at": r.updated_at,
        })
    }))
}

/// Upsert a career profile — called lazily on first milestone award.
async fn ensure_career_profile(db: &Db, user_id: Uuid) -> Result<()> {
    sqlx::query!(
        r#"INSERT INTO career_profiles (user_id)
           VALUES ($1)
           ON CONFLICT (user_id) DO NOTHING"#,
        user_id
    )
    .execute(db)
    .await?;
    Ok(())
}

pub async fn list_milestones(db: &Db, user_id: Uuid) -> Result<Vec<Value>> {
    let rows = sqlx::query!(
        "SELECT id, milestone_key, label, xp_awarded, achieved_at
         FROM career_milestones WHERE user_id = $1 ORDER BY achieved_at DESC",
        user_id
    )
    .fetch_all(db)
    .await?
    .into_iter()
    .map(|r| {
        serde_json::json!({
            "id": r.id, "milestone_key": r.milestone_key, "label": r.label,
            "xp_awarded": r.xp_awarded, "achieved_at": r.achieved_at,
        })
    })
    .collect();
    Ok(rows)
}

pub async fn award_milestone(
    db: &Db,
    kafka_brokers: &str,
    user_id: Uuid,
    req: AwardMilestoneRequest,
) -> Result<Uuid> {
    ensure_career_profile(db, user_id).await?;

    let xp = req.xp_awarded.unwrap_or(100);

    let milestone_id = sqlx::query_scalar!(
        r#"INSERT INTO career_milestones (user_id, milestone_key, label, xp_awarded)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, milestone_key) DO UPDATE SET label = EXCLUDED.label
           RETURNING id"#,
        user_id,
        req.milestone_key,
        req.label,
        xp,
    )
    .fetch_one(db)
    .await?;

    // Update aggregate XP + milestone count on career_profiles
    sqlx::query!(
        r#"UPDATE career_profiles
           SET total_xp = total_xp + $2,
               milestone_count = milestone_count + 1,
               updated_at = NOW()
           WHERE user_id = $1"#,
        user_id,
        xp,
    )
    .execute(db)
    .await?;

    emit_event(
        kafka_brokers,
        TOPIC_COMMUNITY_EVENTS,
        &EventEnvelope::new(
            "CareerMilestoneReached",
            &CareerMilestoneReached {
                user_id,
                milestone_key: req.milestone_key,
                label: req.label,
                xp_awarded: xp as u32,
            },
        ),
    )
    .await;

    Ok(milestone_id)
}

pub async fn list_skill_gaps(db: &Db, user_id: Uuid) -> Result<Vec<Value>> {
    let rows = sqlx::query!(
        r#"SELECT id, skill_tag, current_level, required_level, gap_score, detected_at
           FROM skill_gaps WHERE user_id = $1 ORDER BY gap_score DESC"#,
        user_id
    )
    .fetch_all(db)
    .await?
    .into_iter()
    .map(|r| {
        serde_json::json!({
            "id": r.id, "skill_tag": r.skill_tag, "current_level": r.current_level,
            "required_level": r.required_level, "gap_score": r.gap_score,
            "detected_at": r.detected_at,
        })
    })
    .collect();
    Ok(rows)
}

pub async fn list_learning_paths(db: &Db, user_id: Uuid) -> Result<Vec<Value>> {
    let rows = sqlx::query!(
        r#"SELECT id, title, description, skill_target, steps, progress_pct, assigned_at, completed_at
           FROM learning_paths WHERE user_id = $1 ORDER BY assigned_at DESC"#,
        user_id
    )
    .fetch_all(db)
    .await?
    .into_iter()
    .map(|r| serde_json::json!({
        "id": r.id, "title": r.title, "description": r.description,
        "skill_target": r.skill_target, "steps": r.steps,
        "progress_pct": r.progress_pct, "assigned_at": r.assigned_at,
        "completed_at": r.completed_at,
    }))
    .collect();
    Ok(rows)
}

pub async fn assign_learning_path(
    db: &Db,
    kafka_brokers: &str,
    user_id: Uuid,
    req: AssignPathRequest,
) -> Result<Uuid> {
    ensure_career_profile(db, user_id).await?;

    let path_id = sqlx::query_scalar!(
        r#"INSERT INTO learning_paths (user_id, title, description, skill_target, steps)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id"#,
        user_id,
        req.title,
        req.description.as_deref().unwrap_or(""),
        req.skill_target,
        req.steps,
    )
    .fetch_one(db)
    .await?;

    emit_event(
        kafka_brokers,
        TOPIC_COMMUNITY_EVENTS,
        &EventEnvelope::new(
            "LearningPathAssigned",
            &LearningPathAssigned {
                user_id,
                path_id,
                skill_target: req.skill_target,
            },
        ),
    )
    .await;

    Ok(path_id)
}

pub async fn update_path_progress(db: &Db, path_id: Uuid, progress_pct: i16) -> Result<()> {
    let pct = progress_pct.clamp(0, 100);
    sqlx::query!(
        r#"UPDATE learning_paths
           SET progress_pct = $2,
               completed_at = CASE WHEN $2::INT2 = 100 THEN NOW() ELSE NULL END
           WHERE id = $1"#,
        path_id,
        pct,
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
    let record = FutureRecord::to(topic).payload(&payload).key("career");
    if let Err((e, _)) = producer.send(record, Duration::from_secs(5)).await {
        tracing::warn!("kafka emit failed: {e}");
    }
}
