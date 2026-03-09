use crate::checks::run_all_checks;
use anyhow::Result;
use common::events::{DeploymentStarted, EventEnvelope};
use common::kafka::consumer::KafkaConsumer;
use common::kafka::producer::KafkaProducer;
use sqlx::PgPool;

pub struct OrchestratorConsumer {
    pub consumer: KafkaConsumer,
    pub producer: KafkaProducer,
    pub db:       PgPool,
}

impl OrchestratorConsumer {
    pub fn new(consumer: KafkaConsumer, producer: KafkaProducer, db: PgPool) -> Self {
        Self { consumer, producer, db }
    }

    pub async fn run(self) -> Result<()> {
        tracing::info!("environment-orchestrator consumer started");
        loop {
            let (key, payload) = match self.consumer.next_payload().await {
                Some(p) => p,
                None => {
                    tracing::warn!("consumer stream ended");
                    break;
                }
            };

            let envelope = match serde_json::from_str::<EventEnvelope>(&payload) {
                Ok(e) => e,
                Err(e) => {
                    tracing::warn!(key=%key, error=%e, "failed to parse envelope");
                    continue;
                }
            };

            if envelope.event_type == "DeploymentStarted" {
                if let Ok(evt) = serde_json::from_value::<DeploymentStarted>(envelope.payload) {
                    self.handle_deployment_started(evt).await;
                }
            }
        }
        Ok(())
    }

    async fn handle_deployment_started(&self, evt: DeploymentStarted) {
        tracing::info!(deployment_id=%evt.deployment_id, "running pre-flight checks");

        // Default requirements — in production these come from the agent manifest.
        let results = run_all_checks(&[], &[], 256 * 1024 * 1024).await;

        let all_passed = results.iter().all(|r| r.passed);
        let summary = serde_json::to_string(&results).unwrap_or_default();

        if all_passed {
            tracing::info!(deployment_id=%evt.deployment_id, "environment ready");
            let _ = self
                .producer
                .publish(
                    common::events::TOPIC_DEPLOYMENT_STATUS,
                    &evt.deployment_id.to_string(),
                    &EventEnvelope::new(
                        "EnvironmentReady",
                        &serde_json::json!({
                            "deployment_id": evt.deployment_id,
                            "checks": summary,
                        }),
                    ),
                )
                .await;
        } else {
            tracing::warn!(deployment_id=%evt.deployment_id, "environment checks failed");
            sqlx::query!(
                "UPDATE deployments SET state = 'FAILED', failure_reason = $2, updated_at = NOW()
                 WHERE id = $1",
                evt.deployment_id,
                format!("preflight failed: {summary}"),
            )
            .execute(&self.db)
            .await
            .ok();
        }
    }
}
