//! SuccessTrigger consumer — verifies artifact hash, transitions deployment state,
//! emits escrow release events via Kafka.

use common::{
    errors::DomainError,
    events::{
        EventEnvelope, InstallationCompleted, ReleaseEscrow, TOPIC_ESCROW_COMMANDS,
        TOPIC_INSTALLATION_EVENTS,
    },
    kafka::{consumer::KafkaConsumer, producer::KafkaProducer},
};
use sqlx::PgPool;
use tracing::{error, info, warn};
use uuid::Uuid;

#[derive(Debug, sqlx::Type, PartialEq, Clone, Copy)]
#[sqlx(type_name = "deployment_status", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DeploymentState {
    Pending,
    Provisioning,
    Installing,
    Verifying,
    VetoWindow,
    BiometricPending,
    Released,
    Vetoed,
    Failed,
}

/// Runs the SuccessTrigger consumer loop — never returns; use `tokio::spawn`.
pub async fn run_success_trigger(
    db: PgPool,
    producer: KafkaProducer,
    brokers: String,
) -> anyhow::Result<()> {
    let consumer = KafkaConsumer::new(
        &brokers,
        "deployment-engine-success-trigger",
        &[TOPIC_INSTALLATION_EVENTS],
    )?;

    info!("SuccessTrigger consumer running");

    loop {
        let Some((key, payload)) = consumer.next_payload().await else {
            error!("Kafka consumer terminated unexpectedly");
            break;
        };

        let envelope: EventEnvelope = match serde_json::from_str(&payload) {
            Ok(e) => e,
            Err(e) => {
                warn!(key, "Failed to parse EventEnvelope: {e}");
                continue;
            }
        };

        match envelope.event_type.as_str() {
            "InstallationCompleted" => {
                match serde_json::from_value::<InstallationCompleted>(envelope.payload) {
                    Ok(event) => {
                        if let Err(e) = handle_installation_completed(&db, &producer, event).await {
                            error!("handle_installation_completed: {e:#}");
                        }
                    }
                    Err(e) => warn!("Bad InstallationCompleted payload: {e}"),
                }
            }
            other => info!("Ignoring unknown event type: {other}"),
        }
    }

    Ok(())
}

async fn handle_installation_completed(
    db: &PgPool,
    producer: &KafkaProducer,
    event: InstallationCompleted,
) -> Result<(), DomainError> {
    info!(deployment_id = %event.deployment_id, "Processing InstallationCompleted");

    // Load deployment and verify it is in INSTALLING state
    let deployment = sqlx::query!(
        r#"SELECT id, agent_artifact_hash, escrow_amount_cents,
                  state AS "state: DeploymentState", freelancer_id
           FROM deployments
           WHERE id = $1"#,
        event.deployment_id,
    )
    .fetch_one(db)
    .await
    .map_err(DomainError::DatabaseError)?;

    if deployment.state != DeploymentState::Installing {
        warn!(
            deployment_id = %event.deployment_id,
            state = ?deployment.state,
            "InstallationCompleted received for non-INSTALLING deployment — ignoring"
        );
        return Ok(());
    }

    // Transition to VERIFYING
    set_state(db, event.deployment_id, "VERIFYING").await?;

    // Verify artifact hash — deterministic proof of correct Wasm binary installed
    if event.artifact_hash != deployment.agent_artifact_hash {
        error!(
            deployment_id = %event.deployment_id,
            got  = %event.artifact_hash,
            want = %deployment.agent_artifact_hash,
            "Artifact hash mismatch"
        );
        sqlx::query!(
            "UPDATE deployments SET state = 'FAILED', failure_reason = $2, updated_at = NOW()
             WHERE id = $1",
            event.deployment_id,
            "Artifact hash mismatch",
        )
        .execute(db)
        .await
        .map_err(DomainError::DatabaseError)?;
        return Ok(());
    }

    // Hash verified — release 30% of escrow (freelancer installation cut)
    let release_amount = deployment.escrow_amount_cents as u64 * 30 / 100;

    let release = ReleaseEscrow {
        deployment_id: event.deployment_id,
        freelancer_id: deployment.freelancer_id,
        amount_cents: release_amount,
        reason: "InstallationCompleted — artifact hash verified".into(),
    };

    producer
        .publish(
            TOPIC_ESCROW_COMMANDS,
            &event.deployment_id.to_string(),
            &EventEnvelope::new("ReleaseEscrow", &release),
        )
        .await
        .map_err(|e| DomainError::KafkaError(e.to_string()))?;

    set_state(db, event.deployment_id, "RELEASED").await?;

    info!(
        deployment_id = %event.deployment_id,
        release_cents = release_amount,
        "Escrow released — deployment RELEASED"
    );

    Ok(())
}

async fn set_state(db: &PgPool, id: Uuid, state: &str) -> Result<(), DomainError> {
    sqlx::query(
        "UPDATE deployments SET state = $2::deployment_status, updated_at = NOW() WHERE id = $1",
    )
    .bind(id)
    .bind(state)
    .execute(db)
    .await
    .map_err(DomainError::DatabaseError)?;
    Ok(())
}
