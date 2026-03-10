use anyhow::Result;
use chrono::Utc;
use common::events::{DriftDetected, EventEnvelope, TelemetryHeartbeat, TOPIC_DRIFT_ALERTS};
use common::kafka::producer::KafkaProducer;
use sqlx::{PgPool, Row};

pub struct DriftDetector {
    pub db: PgPool,
    pub producer: KafkaProducer,
}

impl DriftDetector {
    pub fn new(db: PgPool, producer: KafkaProducer) -> Self {
        Self { db, producer }
    }

    pub async fn process_heartbeat(&self, hb: TelemetryHeartbeat) -> Result<()> {
        // 1. Fetch expected artifact hash from the deployment record.
        let expected = sqlx::query_scalar!(
            "SELECT agent_artifact_hash FROM deployments WHERE id = $1",
            hb.deployment_id
        )
        .fetch_one(&self.db)
        .await?;

        // 2. Persist the heartbeat.
        sqlx::query!(
            "INSERT INTO telemetry_heartbeats
                 (id, deployment_id, artifact_hash, cpu_pct, mem_bytes, recorded_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)",
            hb.deployment_id,
            hb.artifact_hash,
            hb.cpu_pct,
            hb.mem_bytes as i64,
            hb.recorded_at,
        )
        .execute(&self.db)
        .await?;

        // 3. Drift check.
        if hb.artifact_hash != expected {
            let drift = DriftDetected {
                deployment_id: hb.deployment_id,
                expected_hash: expected.clone(),
                actual_hash: hb.artifact_hash.clone(),
                detected_at: Utc::now(),
            };

            sqlx::query!(
                "INSERT INTO drift_events (id, deployment_id, expected_hash, actual_hash)
                 VALUES (gen_random_uuid(), $1, $2, $3)",
                hb.deployment_id,
                expected,
                hb.artifact_hash,
            )
            .execute(&self.db)
            .await?;

            let envelope = EventEnvelope::new("DriftDetected", &drift);
            self.producer
                .publish(TOPIC_DRIFT_ALERTS, &hb.deployment_id.to_string(), &envelope)
                .await?;

            // Hold deployment in VETO_WINDOW to trigger warranty evaluation.
            sqlx::query!(
                "UPDATE deployments SET state = 'VETO_WINDOW', updated_at = NOW() WHERE id = $1",
                hb.deployment_id
            )
            .execute(&self.db)
            .await?;

            // Auto-create a warranty claim on behalf of the deploying talent.
            let dep_row = sqlx::query("SELECT freelancer_id FROM deployments WHERE id = $1")
                .bind(hb.deployment_id)
                .fetch_optional(&self.db)
                .await?;

            if let Some(row) = dep_row {
                let claimant_id: uuid::Uuid = row.get("freelancer_id");
                let drift_proof =
                    format!("drift:expected={},actual={}", expected, hb.artifact_hash);
                sqlx::query(
                    "INSERT INTO warranty_claims
                         (id, deployment_id, claimant_id, drift_proof)
                     VALUES (gen_random_uuid(), $1, $2, $3)",
                )
                .bind(hb.deployment_id)
                .bind(claimant_id)
                .bind(drift_proof)
                .execute(&self.db)
                .await?;
            }

            tracing::warn!(deployment_id=%hb.deployment_id, "artifact drift detected — warranty claim created");
        }

        Ok(())
    }
}
