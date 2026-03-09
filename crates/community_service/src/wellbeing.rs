use anyhow::Result;
use common::events::{BurnoutAlertRaised, EventEnvelope, TOPIC_COMMUNITY_EVENTS};
use rdkafka::config::ClientConfig;
use rdkafka::producer::{FutureProducer, FutureRecord};
use serde_json::Value;
use std::time::Duration;
use uuid::Uuid;

use crate::{handlers::CheckinRequest, Db};

pub async fn submit_checkin(
    db: &Db,
    kafka_brokers: &str,
    user_id: Uuid,
    req: CheckinRequest,
) -> Result<Uuid> {
    let checkin_id = sqlx::query_scalar!(
        r#"INSERT INTO wellbeing_checkins (user_id, mood_score, energy_score, stress_score, notes)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id"#,
        user_id,
        req.mood_score,
        req.energy_score,
        req.stress_score,
        req.notes.as_deref(),
    )
    .fetch_one(db)
    .await?;

    // Recompute burnout signal for this user
    recompute_burnout(db, kafka_brokers, user_id).await?;

    Ok(checkin_id)
}

pub async fn list_checkins(db: &Db, user_id: Uuid) -> Result<Vec<Value>> {
    let rows = sqlx::query!(
        r#"SELECT id, mood_score, energy_score, stress_score, notes, checked_in_at
           FROM wellbeing_checkins
           WHERE user_id = $1
           ORDER BY checked_in_at DESC
           LIMIT 30"#,
        user_id
    )
    .fetch_all(db)
    .await?
    .into_iter()
    .map(|r| serde_json::json!({
        "id": r.id, "mood_score": r.mood_score, "energy_score": r.energy_score,
        "stress_score": r.stress_score, "notes": r.notes,
        "checked_in_at": r.checked_in_at,
    }))
    .collect();
    Ok(rows)
}

pub async fn get_burnout_signal(db: &Db, user_id: Uuid) -> Result<Option<Value>> {
    let row = sqlx::query!(
        r#"SELECT id, risk_level, risk_score, avg_stress_7d, avg_mood_7d,
                  checkin_streak, last_alert_at, computed_at
           FROM burnout_signals WHERE user_id = $1"#,
        user_id
    )
    .fetch_optional(db)
    .await?;

    Ok(row.map(|r| serde_json::json!({
        "id": r.id, "risk_level": r.risk_level, "risk_score": r.risk_score,
        "avg_stress_7d": r.avg_stress_7d, "avg_mood_7d": r.avg_mood_7d,
        "checkin_streak": r.checkin_streak, "last_alert_at": r.last_alert_at,
        "computed_at": r.computed_at,
    })))
}

/// Rolling 7-day burnout computation.
/// risk_score = (avg_stress_7d * 1.5 + (10 - avg_mood_7d) * 0.5) * 5  capped at 100.
/// risk_level: 0-29 = low, 30-59 = medium, 60-79 = high, 80+ = critical.
async fn recompute_burnout(db: &Db, kafka_brokers: &str, user_id: Uuid) -> Result<()> {
    struct Stats {
        avg_stress: f64,
        avg_mood: f64,
        streak: i64,
    }

    let row = sqlx::query!(
        r#"SELECT
               COALESCE(AVG(stress_score) FILTER (WHERE checked_in_at > NOW() - INTERVAL '7 days'), 0) AS avg_stress,
               COALESCE(AVG(mood_score)   FILTER (WHERE checked_in_at > NOW() - INTERVAL '7 days'), 5) AS avg_mood,
               COUNT(DISTINCT checked_in_at::date)                                                    AS streak
           FROM wellbeing_checkins
           WHERE user_id = $1 AND checked_in_at > NOW() - INTERVAL '7 days'"#,
        user_id
    )
    .fetch_one(db)
    .await?;

    let avg_stress: f64 = row.avg_stress.unwrap_or(0.0).try_into().unwrap_or(0.0);
    let avg_mood: f64   = row.avg_mood.unwrap_or(5.0).try_into().unwrap_or(5.0);
    let streak: i64     = row.streak.unwrap_or(0);

    let raw_score = (avg_stress * 1.5 + (10.0 - avg_mood) * 0.5) * 5.0;
    let risk_score: i16 = raw_score.clamp(0.0, 100.0) as i16;

    let risk_level = match risk_score {
        0..=29  => "low",
        30..=59 => "medium",
        60..=79 => "high",
        _       => "critical",
    };

    let prev = sqlx::query_scalar!(
        "SELECT risk_level FROM burnout_signals WHERE user_id = $1",
        user_id
    )
    .fetch_optional(db)
    .await?;

    sqlx::query!(
        r#"INSERT INTO burnout_signals (user_id, risk_level, risk_score, avg_stress_7d, avg_mood_7d, checkin_streak, computed_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (user_id) DO UPDATE SET
               risk_level    = EXCLUDED.risk_level,
               risk_score    = EXCLUDED.risk_score,
               avg_stress_7d = EXCLUDED.avg_stress_7d,
               avg_mood_7d   = EXCLUDED.avg_mood_7d,
               checkin_streak= EXCLUDED.checkin_streak,
               computed_at   = NOW()"#,
        user_id,
        risk_level,
        risk_score,
        avg_stress as f64,
        avg_mood as f64,
        streak as i32,
    )
    .execute(db)
    .await?;

    // Emit alert only when escalating from non-critical to high/critical
    let should_alert = matches!(risk_level, "high" | "critical")
        && prev.as_deref().is_none_or(|p| p == "low" || p == "medium");

    if should_alert {
        sqlx::query!(
            "UPDATE burnout_signals SET last_alert_at = NOW() WHERE user_id = $1",
            user_id
        )
        .execute(db)
        .await?;

        emit_event(
            kafka_brokers,
            TOPIC_COMMUNITY_EVENTS,
            &EventEnvelope::new(
                "BurnoutAlertRaised",
                &BurnoutAlertRaised {
                    user_id,
                    risk_level: risk_level.to_string(),
                    risk_score,
                },
            ),
        )
        .await;
    }

    Ok(())
}

// ── Kafka helper ──────────────────────────────────────────────────────────────

async fn emit_event(brokers: &str, topic: &str, envelope: &EventEnvelope) {
    let producer: FutureProducer = match ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("message.timeout.ms", "5000")
        .create()
    {
        Ok(p)  => p,
        Err(e) => { tracing::warn!("kafka producer init failed: {e}"); return; }
    };
    let payload = serde_json::to_string(envelope).unwrap_or_default();
    let record  = FutureRecord::to(topic).payload(&payload).key("wellbeing");
    if let Err((e, _)) = producer.send(record, Duration::from_secs(5)).await {
        tracing::warn!("kafka emit failed: {e}");
    }
}
