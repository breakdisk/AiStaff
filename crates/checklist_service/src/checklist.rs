use anyhow::Result;
use chrono::Utc;
use common::events::{
    ChecklistFinalized, ChecklistStepCompleted, EventEnvelope, TOPIC_CHECKLIST_EVENTS,
};
use common::kafka::producer::KafkaProducer;
use sqlx::PgPool;
use uuid::Uuid;

/// Required steps that must all pass before `ChecklistFinalized` is emitted.
const REQUIRED_STEPS: &[&str] = &[
    "env_preflight_passed",
    "license_validated",
    "wasm_hash_verified",
    "network_egress_configured",
    "smoke_test_passed",
    "client_acceptance_signed",
];

pub struct ChecklistService {
    pub db: PgPool,
    pub producer: KafkaProducer,
}

impl ChecklistService {
    pub fn new(db: PgPool, producer: KafkaProducer) -> Self {
        Self { db, producer }
    }

    pub async fn record_step(
        &self,
        deployment_id: Uuid,
        step_id: String,
        step_label: String,
        passed: bool,
        notes: Option<String>,
    ) -> Result<()> {
        let now = Utc::now();

        sqlx::query!(
            "INSERT INTO dod_checklist_steps
                 (id, deployment_id, step_id, step_label, passed, notes, completed_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
             ON CONFLICT (deployment_id, step_id)
             DO UPDATE SET passed = EXCLUDED.passed, notes = EXCLUDED.notes,
                           completed_at = EXCLUDED.completed_at",
            deployment_id,
            step_id,
            step_label,
            passed,
            notes,
            now,
        )
        .execute(&self.db)
        .await?;

        let event = ChecklistStepCompleted {
            deployment_id,
            step_id,
            step_label,
            passed,
            notes,
            completed_at: now,
        };
        self.producer
            .publish(
                TOPIC_CHECKLIST_EVENTS,
                &deployment_id.to_string(),
                &EventEnvelope::new("ChecklistStepCompleted", &event),
            )
            .await?;

        // Attempt to finalize after every step update.
        self.try_finalize(deployment_id).await?;

        Ok(())
    }

    async fn try_finalize(&self, deployment_id: Uuid) -> Result<()> {
        // Collect all completed steps for this deployment.
        let rows = sqlx::query!(
            "SELECT step_id, passed FROM dod_checklist_steps WHERE deployment_id = $1",
            deployment_id
        )
        .fetch_all(&self.db)
        .await?;

        let completed_ids: Vec<&str> = rows.iter().map(|r| r.step_id.as_str()).collect();

        // Check that every required step has been completed.
        let all_required_present = REQUIRED_STEPS.iter().all(|r| completed_ids.contains(r));

        if !all_required_present {
            return Ok(()); // Not ready to finalize yet.
        }

        let failed_steps: Vec<String> = rows
            .iter()
            .filter(|r| !r.passed)
            .map(|r| r.step_id.clone())
            .collect();

        let all_passed = failed_steps.is_empty();

        // Upsert summary.
        sqlx::query!(
            "INSERT INTO dod_checklist_summaries (deployment_id, all_passed, failed_steps)
             VALUES ($1, $2, $3)
             ON CONFLICT (deployment_id) DO UPDATE
             SET all_passed = EXCLUDED.all_passed, failed_steps = EXCLUDED.failed_steps,
                 finalized_at = NOW()",
            deployment_id,
            all_passed,
            &failed_steps,
        )
        .execute(&self.db)
        .await?;

        let event = ChecklistFinalized {
            deployment_id,
            all_passed,
            failed_steps,
        };
        self.producer
            .publish(
                TOPIC_CHECKLIST_EVENTS,
                &deployment_id.to_string(),
                &EventEnvelope::new("ChecklistFinalized", &event),
            )
            .await?;

        tracing::info!(%deployment_id, %all_passed, "checklist finalized");
        Ok(())
    }
}
