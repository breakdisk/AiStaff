//! ChecklistFinalized consumer — provisions the Wasm sandbox once all DoD
//! checklist steps pass, then emits DeploymentComplete to trigger the
//! Veto-First payout window in `payout_service`.

use anyhow::Result;
use common::{
    events::{
        ChecklistFinalized, DeploymentComplete, EventEnvelope,
        TOPIC_CHECKLIST_EVENTS, TOPIC_DEPLOYMENT_COMPLETE,
    },
    kafka::{consumer::KafkaConsumer, producer::KafkaProducer},
};
use sqlx::{PgPool, Row};
use std::collections::{HashMap, HashSet};
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::mcp_proxy::{CapabilityManifest, McpProxy};
use crate::sandbox::{AiAgent, ClientCredentials};

/// Minimal valid Wasm module with a no-op `_start` export.
/// Used when `ARTIFACT_STORE_URL` is not configured (dev / CI environments).
const STUB_WASM: &[u8] = &[
    0x00, 0x61, 0x73, 0x6d, // magic "\0asm"
    0x01, 0x00, 0x00, 0x00, // version 1
    0x01, 0x04, 0x01, 0x60, 0x00, 0x00, // type section: () -> ()
    0x03, 0x02, 0x01, 0x00, // function section: 1 func of type 0
    0x07, 0x0a, 0x01, 0x06, 0x5f, 0x73, 0x74, 0x61, 0x72, 0x74, 0x00, 0x00, // export "_start"
    0x0a, 0x04, 0x01, 0x02, 0x00, 0x0b, // code: no-op body
];

/// Runs the ChecklistFinalized consumer loop.
/// Listens on `TOPIC_CHECKLIST_EVENTS`; when a deployment's DoD checklist
/// finalises with all steps passing it provisions the Wasm sandbox and
/// transitions the deployment into the VETO_WINDOW state.
pub async fn run_checklist_consumer(
    db:      PgPool,
    producer: KafkaProducer,
    brokers:  String,
) -> Result<()> {
    let consumer = KafkaConsumer::new(
        &brokers,
        "deployment-engine-checklist",
        &[TOPIC_CHECKLIST_EVENTS],
    )?;

    info!("ChecklistConsumer running on {TOPIC_CHECKLIST_EVENTS}");

    loop {
        let Some((key, payload)) = consumer.next_payload().await else {
            error!("ChecklistConsumer Kafka stream ended unexpectedly");
            break;
        };

        let envelope: EventEnvelope = match serde_json::from_str(&payload) {
            Ok(e) => e,
            Err(e) => {
                warn!(key, "Failed to parse EventEnvelope: {e}");
                continue;
            }
        };

        if envelope.event_type != "ChecklistFinalized" {
            continue;
        }

        let event = match serde_json::from_value::<ChecklistFinalized>(envelope.payload) {
            Ok(e) => e,
            Err(e) => {
                warn!("Bad ChecklistFinalized payload: {e}");
                continue;
            }
        };

        if !event.all_passed {
            info!(
                deployment_id = %event.deployment_id,
                failed = ?event.failed_steps,
                "ChecklistFinalized with failures — sandbox not provisioned"
            );
            continue;
        }

        if let Err(e) = handle_finalized(&db, &producer, event).await {
            error!("handle_finalized: {e:#}");
        }
    }

    Ok(())
}

async fn handle_finalized(
    db:       &PgPool,
    producer: &KafkaProducer,
    event:    ChecklistFinalized,
) -> Result<()> {
    // Load deployment fields needed for sandbox provisioning.
    let row = sqlx::query(
        "SELECT agent_id, client_id, freelancer_id, developer_id,
                agent_artifact_hash, escrow_amount_cents
         FROM deployments WHERE id = $1",
    )
    .bind(event.deployment_id)
    .fetch_one(db)
    .await?;

    let agent_id:            Uuid   = row.get("agent_id");
    let client_id:           Uuid   = row.get("client_id");
    let freelancer_id:       Uuid   = row.get("freelancer_id");
    let developer_id:        Uuid   = row.get("developer_id");
    let artifact_hash: String       = row.get("agent_artifact_hash");
    let escrow_cents:  i64          = row.get("escrow_amount_cents");

    set_state(db, event.deployment_id, "PROVISIONING").await?;
    info!(deployment_id = %event.deployment_id, "Provisioning Wasm sandbox");

    // Fetch artifact bytes; fall back to no-op stub if store not configured.
    let wasm_bytes = fetch_artifact(&artifact_hash).await;

    let agent = AiAgent {
        id:            agent_id,
        name:          format!("agent-{agent_id}"),
        wasm_bytes,
        artifact_hash: artifact_hash.clone(),
    };

    // Credentials are injected via host functions — secrets loaded from
    // the secrets store in production. Empty map is safe for the sandbox itself.
    let credentials = ClientCredentials {
        client_id,
        secrets: HashMap::new(),
    };

    // Build MCP proxy — allowed_tools loaded from DB in production; empty = deny-all safe default.
    let mcp_url = std::env::var("MCP_SERVER_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:4040".into());
    let proxy = McpProxy::new(CapabilityManifest {
        agent_id:      agent_id,
        allowed_tools: HashSet::new(),
        mcp_endpoint:  mcp_url,
    });

    match crate::sandbox::provision_sandbox(agent, credentials, event.deployment_id, db.clone(), Some(proxy)).await {
        Ok(result) => {
            info!(
                deployment_id = %event.deployment_id,
                sandbox_id    = %result.sandbox_id,
                "Sandbox provisioned — entering VETO_WINDOW"
            );

            // Emit DeploymentComplete → payout_service starts 30s veto window.
            let complete = DeploymentComplete {
                deployment_id: event.deployment_id,
                developer_id,
                talent_id:    freelancer_id,
                total_cents:  escrow_cents as u64,
                artifact_hash: result.artifact_hash,
            };
            producer
                .publish(
                    TOPIC_DEPLOYMENT_COMPLETE,
                    &event.deployment_id.to_string(),
                    &EventEnvelope::new("DeploymentComplete", &complete),
                )
                .await?;

            set_state(db, event.deployment_id, "VETO_WINDOW").await?;
        }
        Err(e) => {
            error!(deployment_id = %event.deployment_id, "Sandbox provisioning failed: {e}");
            sqlx::query(
                "UPDATE deployments
                 SET state = 'FAILED'::deployment_status,
                     failure_reason = $2,
                     updated_at = NOW()
                 WHERE id = $1",
            )
            .bind(event.deployment_id)
            .bind(e.to_string())
            .execute(db)
            .await?;
        }
    }

    Ok(())
}

/// Fetches Wasm artifact bytes by hash.
/// Tries `{ARTIFACT_STORE_URL}/{hash}`; falls back to a no-op stub.
async fn fetch_artifact(artifact_hash: &str) -> Vec<u8> {
    if let Ok(base) = std::env::var("ARTIFACT_STORE_URL") {
        let url = format!("{base}/{artifact_hash}");
        match reqwest::get(&url).await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(bytes) = resp.bytes().await {
                    info!(artifact_hash, "Loaded Wasm artifact from store");
                    return bytes.to_vec();
                }
            }
            Ok(resp) => warn!(
                status = %resp.status(),
                artifact_hash,
                "Artifact store returned non-success"
            ),
            Err(e) => warn!(artifact_hash, "Artifact store unreachable: {e}"),
        }
    }

    warn!(
        artifact_hash,
        "ARTIFACT_STORE_URL not set — using no-op stub Wasm"
    );
    STUB_WASM.to_vec()
}

async fn set_state(db: &PgPool, id: Uuid, state: &str) -> Result<()> {
    sqlx::query(
        "UPDATE deployments SET state = $2::deployment_status, updated_at = NOW() WHERE id = $1",
    )
    .bind(id)
    .bind(state)
    .execute(db)
    .await?;
    Ok(())
}
