//! AI Project Manager — scope drift consumer.
//!
//! Listens on `chat.messages`, runs a Claude Haiku triage call against the
//! deployment's SOW (or listing description as fallback), and emits
//! `ScopeDriftDetected` to `pm.events` when confidence >= 0.75.
//!
//! Two-model strategy:
//!   Haiku  — cheap, < 1 s, runs on every message.
//!   Sonnet — deep reasoning, emitted only when Haiku flags high confidence.
//!            (Sonnet escalation is a Phase 3 addition; Haiku covers MVP.)

use anyhow::Result;
use common::{
    events::{
        ChatMessageCreated, EventEnvelope, ScopeDriftDetected,
        TOPIC_CHAT_MESSAGES, TOPIC_PM_EVENTS,
    },
    kafka::{consumer::KafkaConsumer, producer::KafkaProducer},
};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use tracing::{error, info, warn};

// ── Anthropic API types ───────────────────────────────────────────────────────

#[derive(Serialize)]
struct AnthropicRequest {
    model:      String,
    max_tokens: u32,
    system:     String,
    messages:   Vec<AnthropicMessage>,
}

#[derive(Serialize)]
struct AnthropicMessage {
    role:    String,
    content: String,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContent>,
}

#[derive(Deserialize)]
struct AnthropicContent {
    text: String,
}

/// Structured output from the Haiku triage call.
#[derive(Deserialize)]
struct HaikuTriage {
    is_scope_drift: bool,
    confidence:     f32,
    summary:        String,
}

// ── Consumer loop ─────────────────────────────────────────────────────────────

pub async fn run_pm_consumer(
    db:       PgPool,
    producer: KafkaProducer,
    brokers:  String,
    http:     reqwest::Client,
) -> Result<()> {
    let api_key = std::env::var("ANTHROPIC_API_KEY").unwrap_or_default();
    if api_key.is_empty() {
        warn!("ANTHROPIC_API_KEY not set — AI PM scope triage disabled");
        // Park without error so the other services still start.
        std::future::pending::<()>().await;
        return Ok(());
    }

    let consumer = KafkaConsumer::new(
        &brokers,
        "deployment-engine-pm",
        &[TOPIC_CHAT_MESSAGES],
    )?;

    info!("AI PM consumer running on {TOPIC_CHAT_MESSAGES}");

    loop {
        let Some((key, payload)) = consumer.next_payload().await else {
            error!("AI PM consumer Kafka stream ended");
            break;
        };

        let envelope: EventEnvelope = match serde_json::from_str(&payload) {
            Ok(e) => e,
            Err(e) => {
                warn!(key, "PM consumer: failed to parse EventEnvelope: {e}");
                continue;
            }
        };

        if envelope.event_type != "ChatMessageCreated" {
            continue;
        }

        let event: ChatMessageCreated =
            match serde_json::from_value(envelope.payload) {
                Ok(e) => e,
                Err(e) => {
                    warn!("Bad ChatMessageCreated payload: {e}");
                    continue;
                }
            };

        if let Err(e) = handle_message(&db, &producer, &http, &api_key, event).await {
            error!("PM handle_message: {e:#}");
        }
    }

    Ok(())
}

// ── Per-message handler ───────────────────────────────────────────────────────

async fn handle_message(
    db:       &PgPool,
    producer: &KafkaProducer,
    http:     &reqwest::Client,
    api_key:  &str,
    event:    ChatMessageCreated,
) -> Result<()> {
    // Skip very short messages (greetings, ack, single words).
    if event.body.split_whitespace().count() < 5 {
        return Ok(());
    }

    // Fetch SOW: prefer deployments.sow_text, fall back to listing name + description.
    let sow = fetch_sow(db, event.deployment_id).await?;
    if sow.is_empty() {
        // No scope baseline yet — nothing to compare against.
        return Ok(());
    }

    // Call Claude Haiku for lightweight triage.
    let triage = match haiku_triage(http, api_key, &sow, &event.body).await {
        Ok(t)  => t,
        Err(e) => {
            warn!(deployment_id = %event.deployment_id, "Haiku triage failed: {e}");
            return Ok(());
        }
    };

    if !triage.is_scope_drift || triage.confidence < 0.75 {
        return Ok(());
    }

    info!(
        deployment_id = %event.deployment_id,
        confidence    = triage.confidence,
        summary       = %triage.summary,
        "Scope drift detected — emitting ScopeDriftDetected"
    );

    let drift = ScopeDriftDetected {
        deployment_id:      event.deployment_id,
        trigger_message_id: event.message_id,
        summary:            triage.summary,
        confidence:         triage.confidence,
    };
    producer
        .publish(
            TOPIC_PM_EVENTS,
            &event.deployment_id.to_string(),
            &EventEnvelope::new("ScopeDriftDetected", &drift),
        )
        .await?;

    Ok(())
}

// ── SOW fetch ─────────────────────────────────────────────────────────────────

async fn fetch_sow(db: &PgPool, deployment_id: uuid::Uuid) -> Result<String> {
    let row = sqlx::query(
        "SELECT d.sow_text, al.name, al.description
         FROM deployments d
         JOIN agent_listings al ON al.id = d.agent_id
         WHERE d.id = $1",
    )
    .bind(deployment_id)
    .fetch_optional(db)
    .await?;

    let Some(row) = row else { return Ok(String::new()) };

    // Use explicit SOW if set, otherwise synthesise from listing fields.
    if let Ok(Some(sow)) = row.try_get::<Option<String>, _>("sow_text") {
        if !sow.trim().is_empty() {
            return Ok(sow);
        }
    }

    let name: String  = row.try_get("name").unwrap_or_default();
    let desc: String  = row.try_get("description").unwrap_or_default();
    if name.is_empty() && desc.is_empty() {
        return Ok(String::new());
    }
    Ok(format!("Agent: {name}\n\n{desc}"))
}

// ── Haiku triage call ─────────────────────────────────────────────────────────

async fn haiku_triage(
    http:    &reqwest::Client,
    api_key: &str,
    sow:     &str,
    message: &str,
) -> Result<HaikuTriage> {
    let system_prompt = format!(
        "You are an AI project manager monitoring a freelancer deployment.\n\
         Respond with ONLY a JSON object — no explanation, no markdown fences.\n\n\
         The agreed project scope is:\n{sow}\n\n\
         Determine if the following message requests work OUTSIDE this scope.\n\
         Return exactly: \
         {{\"is_scope_drift\": true|false, \"confidence\": 0.0-1.0, \
         \"summary\": \"one sentence if drift, else empty string\"}}",
        sow = sow
    );

    let request = AnthropicRequest {
        model:      "claude-haiku-4-5".to_string(),
        max_tokens: 150,
        system:     system_prompt,
        messages:   vec![AnthropicMessage {
            role:    "user".to_string(),
            content: message.to_string(),
        }],
    };

    let resp = http
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&request)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body   = resp.text().await.unwrap_or_default();
        anyhow::bail!("Anthropic API {status}: {body}");
    }

    let anthropic_resp: AnthropicResponse = resp.json().await?;
    let text = anthropic_resp
        .content
        .into_iter()
        .next()
        .map(|c| c.text)
        .unwrap_or_default();

    // Strip any accidental markdown fences before parsing.
    let clean = text.trim().trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();
    let triage: HaikuTriage = serde_json::from_str(clean)
        .map_err(|e| anyhow::anyhow!("Haiku JSON parse failed ({e}): {clean}"))?;

    Ok(triage)
}
