use anyhow::Result;
use common::events::{CarbonOffsetLogged, EventEnvelope, TOPIC_COMMUNITY_EVENTS};
use rdkafka::config::ClientConfig;
use rdkafka::producer::{FutureProducer, FutureRecord};
use serde_json::Value;
use std::time::Duration;
use uuid::Uuid;

use crate::{handlers::LogOffsetRequest, Db};

pub async fn log_carbon_offset(
    db: &Db,
    kafka_brokers: &str,
    user_id: Uuid,
    req: LogOffsetRequest,
) -> Result<Uuid> {
    let offset_id = sqlx::query_scalar!(
        r#"INSERT INTO carbon_offsets (user_id, offset_kg, activity_type, provider, certificate_url)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id"#,
        user_id,
        req.offset_kg,
        req.activity_type.as_deref().unwrap_or("compute"),
        req.provider.as_deref(),
        req.certificate_url.as_deref(),
    )
    .fetch_one(db)
    .await?;

    // Upsert aggregate footprint row
    sqlx::query!(
        r#"INSERT INTO carbon_footprints (user_id, total_kg_offset)
           VALUES ($1, $2)
           ON CONFLICT (user_id) DO UPDATE SET
               total_kg_offset = carbon_footprints.total_kg_offset + EXCLUDED.total_kg_offset,
               updated_at = NOW()"#,
        user_id,
        req.offset_kg,
    )
    .execute(db)
    .await?;

    emit_event(
        kafka_brokers,
        TOPIC_COMMUNITY_EVENTS,
        &EventEnvelope::new(
            "CarbonOffsetLogged",
            &CarbonOffsetLogged {
                user_id,
                offset_id,
                offset_kg: req.offset_kg,
                activity_type: req.activity_type.unwrap_or_else(|| "compute".into()),
            },
        ),
    )
    .await;

    Ok(offset_id)
}

pub async fn get_carbon_footprint(db: &Db, user_id: Uuid) -> Result<Option<Value>> {
    let row = sqlx::query!(
        r#"SELECT id, total_kg_offset, total_kg_emitted, net_kg, updated_at
           FROM carbon_footprints WHERE user_id = $1"#,
        user_id
    )
    .fetch_optional(db)
    .await?;

    Ok(row.map(|r| serde_json::json!({
        "id": r.id,
        "total_kg_offset":  r.total_kg_offset,
        "total_kg_emitted": r.total_kg_emitted,
        "net_kg":           r.net_kg,
        "updated_at":       r.updated_at,
    })))
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
    let record  = FutureRecord::to(topic).payload(&payload).key("carbon");
    if let Err((e, _)) = producer.send(record, Duration::from_secs(5)).await {
        tracing::warn!("kafka emit failed: {e}");
    }
}
