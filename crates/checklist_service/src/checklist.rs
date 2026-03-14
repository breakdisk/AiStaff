use anyhow::Result;
use chrono::Utc;
use common::events::{
    ChecklistFinalized, ChecklistStepCompleted, DeploymentComplete,
    EventEnvelope, TOPIC_CHECKLIST_EVENTS, TOPIC_DEPLOYMENT_COMPLETE,
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

        let finalized_event = ChecklistFinalized {
            deployment_id,
            all_passed,
            failed_steps,
        };
        self.producer
            .publish(
                TOPIC_CHECKLIST_EVENTS,
                &deployment_id.to_string(),
                &EventEnvelope::new("ChecklistFinalized", &finalized_event),
            )
            .await?;

        tracing::info!(%deployment_id, %all_passed, "checklist finalized");

        // When all DoD steps pass, emit DeploymentComplete to start the
        // 30-second veto window in payout_service.
        if all_passed {
            self.emit_deployment_complete(deployment_id).await?;
        }

        Ok(())
    }

    async fn emit_deployment_complete(&self, deployment_id: Uuid) -> Result<()> {
        use sqlx::Row;

        let row = sqlx::query(
            "SELECT developer_id, freelancer_id, escrow_amount_cents, agent_artifact_hash
             FROM deployments WHERE id = $1",
        )
        .bind(deployment_id)
        .fetch_optional(&self.db)
        .await?;

        let Some(row) = row else {
            tracing::warn!(%deployment_id, "emit_deployment_complete: deployment not found");
            return Ok(());
        };

        let developer_id: Option<Uuid> = row.get("developer_id");
        let freelancer_id: Uuid        = row.get("freelancer_id");
        let escrow_cents: i64          = row.get("escrow_amount_cents");
        let artifact_hash: String      = row.get("agent_artifact_hash");

        let event = DeploymentComplete {
            deployment_id,
            developer_id:  developer_id.unwrap_or(freelancer_id),
            talent_id:     freelancer_id,
            total_cents:   escrow_cents as u64,
            artifact_hash,
        };

        self.producer
            .publish(
                TOPIC_DEPLOYMENT_COMPLETE,
                &deployment_id.to_string(),
                &EventEnvelope::new("DeploymentComplete", &event),
            )
            .await?;

        tracing::info!(
            %deployment_id,
            "DeploymentComplete emitted — 30s veto window starting in payout_service"
        );
        Ok(())
    }
}
