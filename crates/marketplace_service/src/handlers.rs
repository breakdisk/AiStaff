//! Marketplace HTTP handlers — deployment creation, status query.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use common::{
    events::{
        DeploymentComplete, DeploymentStarted, EventEnvelope,
        TOPIC_DEPLOYMENT_COMPLETE, TOPIC_DEPLOYMENT_STARTED,
    },
    kafka::producer::KafkaProducer,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

pub struct AppState {
    pub db: PgPool,
    pub producer: KafkaProducer,
}

pub type SharedState = Arc<AppState>;

// ── POST /deployments ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateDeploymentRequest {
    pub agent_id: Uuid,
    pub client_id: Uuid,
    pub freelancer_id: Uuid,
    /// Agent builder — defaults to `freelancer_id` when omitted.
    pub developer_id: Option<Uuid>,
    /// SHA-256 hex of the agent Wasm artifact — used for drift detection.
    pub agent_artifact_hash: String,
    /// Total escrow in USD cents (developer 70% + talent 30%).
    pub escrow_amount_cents: i64,
    /// UUID v7 idempotency key.  If provided and a deployment already exists
    /// with this transaction_id, the existing record is returned (HTTP 200).
    pub transaction_id: Option<Uuid>,
    /// Stripe PaymentIntent ID — populated after payment confirmation.
    pub stripe_payment_intent_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CreateDeploymentResponse {
    pub deployment_id: Uuid,
    pub state: String,
}

pub async fn create_deployment(
    State(state): State<SharedState>,
    Json(req): Json<CreateDeploymentRequest>,
) -> impl IntoResponse {
    use sqlx::Row;

    let transaction_id = req.transaction_id.unwrap_or_else(Uuid::now_v7);
    let developer_id   = req.developer_id.unwrap_or(req.freelancer_id);

    // 1. Idempotency: if this transaction_id was already used, return the
    //    existing deployment so the client can safely retry.
    let existing = sqlx::query(
        "SELECT id, state::TEXT AS state FROM deployments WHERE transaction_id = $1",
    )
    .bind(transaction_id)
    .fetch_optional(&state.db)
    .await;

    if let Ok(Some(row)) = existing {
        let dep_id: Uuid  = row.get("id");
        let dep_state: &str = row.get("state");
        tracing::info!(%dep_id, "deployment idempotency hit — returning existing record");
        return (
            StatusCode::OK,
            Json(CreateDeploymentResponse {
                deployment_id: dep_id,
                state: dep_state.into(),
            }),
        )
            .into_response();
    }

    // 2. Insert deployment record in PENDING state.
    //    Use Uuid::now_v7() for the primary key so events are time-ordered.
    let deployment_id = Uuid::now_v7();

    let insert = sqlx::query(
        "INSERT INTO deployments
             (id, agent_id, client_id, freelancer_id, developer_id,
              agent_artifact_hash, escrow_amount_cents,
              transaction_id, stripe_payment_intent_id,
              payment_status, state)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING'::deployment_status)",
    )
    .bind(deployment_id)
    .bind(req.agent_id)
    .bind(req.client_id)
    .bind(req.freelancer_id)
    .bind(developer_id)
    .bind(&req.agent_artifact_hash)
    .bind(req.escrow_amount_cents)
    .bind(transaction_id)
    .bind(&req.stripe_payment_intent_id)
    .bind(if req.stripe_payment_intent_id.is_some() { "confirmed" } else { "pending" })
    .execute(&state.db)
    .await;

    if let Err(e) = insert {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    // 3. Publish DeploymentStarted → wakes the environment_orchestrator.
    let event = DeploymentStarted {
        deployment_id,
        agent_id: req.agent_id,
        client_id: req.client_id,
        freelancer_id: req.freelancer_id,
    };
    let envelope = EventEnvelope::new("DeploymentStarted", &event);

    if let Err(e) = state
        .producer
        .publish(
            TOPIC_DEPLOYMENT_STARTED,
            &deployment_id.to_string(),
            &envelope,
        )
        .await
    {
        tracing::error!(
            %deployment_id,
            "DeploymentStarted publish failed (pipeline will not auto-start): {e}"
        );
    }

    tracing::info!(%deployment_id, %transaction_id, "deployment created, DeploymentStarted emitted");

    (
        StatusCode::CREATED,
        Json(CreateDeploymentResponse {
            deployment_id,
            state: "PENDING".into(),
        }),
    )
        .into_response()
}

// ── POST /deployments/:id/complete ────────────────────────────────────────────
// Admin / worker endpoint: marks a deployment done and fires DeploymentComplete,
// which starts the 30-second veto window in payout_service.

pub async fn complete_deployment(
    State(state): State<SharedState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    use sqlx::Row;

    let row = sqlx::query(
        "SELECT developer_id, freelancer_id, escrow_amount_cents, agent_artifact_hash
         FROM deployments WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    let row = match row {
        Ok(Some(r)) => r,
        Ok(None)    => return StatusCode::NOT_FOUND.into_response(),
        Err(e)      => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let developer_id: Option<Uuid> = row.get("developer_id");
    let freelancer_id: Uuid        = row.get("freelancer_id");
    let escrow_cents: i64          = row.get("escrow_amount_cents");
    let artifact_hash: String      = row.get("agent_artifact_hash");

    let event = DeploymentComplete {
        deployment_id:  id,
        developer_id:   developer_id.unwrap_or(freelancer_id),
        talent_id:      freelancer_id,
        total_cents:    escrow_cents as u64,
        artifact_hash,
    };

    let envelope = EventEnvelope::new("DeploymentComplete", &event);
    if let Err(e) = state
        .producer
        .publish(TOPIC_DEPLOYMENT_COMPLETE, &id.to_string(), &envelope)
        .await
    {
        tracing::error!(%id, "DeploymentComplete publish failed: {e}");
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    // Transition state to VERIFYING so the UI reflects progress.
    sqlx::query(
        "UPDATE deployments SET state = 'VERIFYING'::deployment_status, updated_at = NOW()
         WHERE id = $1",
    )
    .bind(id)
    .execute(&state.db)
    .await
    .ok();

    tracing::info!(%id, "DeploymentComplete emitted — veto window starting");

    (
        StatusCode::OK,
        Json(serde_json::json!({ "ok": true, "deployment_id": id, "state": "VERIFYING" })),
    )
        .into_response()
}

// ── GET /deployments/:id ──────────────────────────────────────────────────────

pub async fn get_deployment(
    State(state): State<SharedState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    use sqlx::Row;

    let row = sqlx::query(
        "SELECT id, agent_id, client_id, freelancer_id,
                agent_artifact_hash, escrow_amount_cents,
                state::TEXT AS state, failure_reason, created_at, updated_at
         FROM deployments WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(r)) => {
            let dep_id: Uuid = r.get("id");
            let agent_id: Uuid = r.get("agent_id");
            let client_id: Uuid = r.get("client_id");
            let freelancer_id: Uuid = r.get("freelancer_id");
            let hash: &str = r.get("agent_artifact_hash");
            let cents: i64 = r.get("escrow_amount_cents");
            let state_str: &str = r.get("state");
            let failure: Option<&str> = r.get("failure_reason");
            let created: chrono::DateTime<chrono::Utc> = r.get("created_at");
            let updated: chrono::DateTime<chrono::Utc> = r.get("updated_at");

            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "id":                   dep_id,
                    "agent_id":             agent_id,
                    "client_id":            client_id,
                    "freelancer_id":        freelancer_id,
                    "agent_artifact_hash":  hash,
                    "escrow_amount_cents":  cents,
                    "state":                state_str,
                    "failure_reason":       failure,
                    "created_at":           created.to_rfc3339(),
                    "updated_at":           updated.to_rfc3339(),
                })),
            )
                .into_response()
        }
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── POST /listings ────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateListingRequest {
    pub developer_id: Uuid,
    pub name: String,
    pub description: String,
    /// SHA-256 hex of the Wasm artifact.
    pub wasm_hash: String,
    /// Price in USD cents.
    pub price_cents: i64,
    /// "AiTalent" | "AiStaff" | "AiRobot"
    pub category: String,
    /// "Agency" | "Freelancer"
    pub seller_type: String,
}

pub async fn create_listing(
    State(state): State<SharedState>,
    Json(req): Json<CreateListingRequest>,
) -> impl IntoResponse {
    const VALID_CATS: &[&str] = &["AiTalent", "AiStaff", "AiRobot"];
    const VALID_SELLERS: &[&str] = &["Agency", "Freelancer"];

    if !VALID_CATS.contains(&req.category.as_str()) {
        return (
            StatusCode::BAD_REQUEST,
            "category must be AiTalent|AiStaff|AiRobot",
        )
            .into_response();
    }
    if !VALID_SELLERS.contains(&req.seller_type.as_str()) {
        return (
            StatusCode::BAD_REQUEST,
            "seller_type must be Agency|Freelancer",
        )
            .into_response();
    }

    let listing_id = Uuid::now_v7();

    let insert = sqlx::query(
        "INSERT INTO agent_listings
             (id, developer_id, name, description, wasm_hash, price_cents, category, seller_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(listing_id)
    .bind(req.developer_id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(&req.wasm_hash)
    .bind(req.price_cents)
    .bind(&req.category)
    .bind(&req.seller_type)
    .execute(&state.db)
    .await;

    match insert {
        Ok(_) => {
            tracing::info!(%listing_id, "agent listing created");
            (
                StatusCode::CREATED,
                Json(serde_json::json!({ "listing_id": listing_id })),
            )
                .into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── GET /listings ─────────────────────────────────────────────────────────────

pub async fn list_listings(State(state): State<SharedState>) -> impl IntoResponse {
    use sqlx::Row;

    let rows = sqlx::query(
        "SELECT id, developer_id, name, description, wasm_hash,
                price_cents, active, category, seller_type, created_at, updated_at
         FROM agent_listings
         WHERE active = TRUE
         ORDER BY created_at DESC
         LIMIT 100",
    )
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rs) => {
            let listings: Vec<serde_json::Value> = rs
                .iter()
                .map(|r| {
                    let id: Uuid = r.get("id");
                    let developer_id: Uuid = r.get("developer_id");
                    let name: &str = r.get("name");
                    let description: &str = r.get("description");
                    let wasm_hash: &str = r.get("wasm_hash");
                    let price_cents: i64 = r.get("price_cents");
                    let active: bool = r.get("active");
                    let category: &str = r.get("category");
                    let seller_type: &str = r.get("seller_type");
                    let created: chrono::DateTime<chrono::Utc> = r.get("created_at");
                    let updated: chrono::DateTime<chrono::Utc> = r.get("updated_at");

                    serde_json::json!({
                        "id":           id,
                        "developer_id": developer_id,
                        "name":         name,
                        "description":  description,
                        "wasm_hash":    wasm_hash,
                        "price_cents":  price_cents,
                        "active":       active,
                        "category":     category,
                        "seller_type":  seller_type,
                        "created_at":   created.to_rfc3339(),
                        "updated_at":   updated.to_rfc3339(),
                    })
                })
                .collect();

            (
                StatusCode::OK,
                Json(serde_json::json!({ "listings": listings })),
            )
                .into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── GET /listings/:id ─────────────────────────────────────────────────────────

pub async fn get_listing(
    State(state): State<SharedState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    use sqlx::Row;

    let row = sqlx::query(
        "SELECT id, developer_id, name, description, wasm_hash,
                price_cents, active, category, seller_type, created_at, updated_at
         FROM agent_listings WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(r)) => {
            let listing_id: Uuid = r.get("id");
            let developer_id: Uuid = r.get("developer_id");
            let name: &str = r.get("name");
            let description: &str = r.get("description");
            let wasm_hash: &str = r.get("wasm_hash");
            let price_cents: i64 = r.get("price_cents");
            let active: bool = r.get("active");
            let category: &str = r.get("category");
            let seller_type: &str = r.get("seller_type");
            let created: chrono::DateTime<chrono::Utc> = r.get("created_at");
            let updated: chrono::DateTime<chrono::Utc> = r.get("updated_at");

            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "id":           listing_id,
                    "developer_id": developer_id,
                    "name":         name,
                    "description":  description,
                    "wasm_hash":    wasm_hash,
                    "price_cents":  price_cents,
                    "active":       active,
                    "category":     category,
                    "seller_type":  seller_type,
                    "created_at":   created.to_rfc3339(),
                    "updated_at":   updated.to_rfc3339(),
                })),
            )
                .into_response()
        }
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── GET /skill-tags ───────────────────────────────────────────────────────────

pub async fn get_skill_tags(State(state): State<SharedState>) -> impl IntoResponse {
    use sqlx::Row;

    let rows = sqlx::query("SELECT id, tag, domain FROM skill_tags ORDER BY domain, tag")
        .fetch_all(&state.db)
        .await;

    match rows {
        Ok(rs) => {
            let tags: Vec<serde_json::Value> = rs
                .iter()
                .map(|r| {
                    let id: Uuid = r.get("id");
                    let tag: &str = r.get("tag");
                    let domain: &str = r.get("domain");
                    serde_json::json!({ "id": id, "tag": tag, "domain": domain })
                })
                .collect();
            (
                StatusCode::OK,
                Json(serde_json::json!({ "skill_tags": tags })),
            )
                .into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── GET /talent-skills/:profile_id ────────────────────────────────────────────

pub async fn get_talent_skills(
    State(state): State<SharedState>,
    Path(profile_id): Path<Uuid>,
) -> impl IntoResponse {
    use sqlx::Row;

    let rows = sqlx::query(
        "SELECT ts.tag_id, st.tag, st.domain, ts.proficiency, ts.verified_at
         FROM talent_skills ts
         JOIN skill_tags st ON st.id = ts.tag_id
         WHERE ts.talent_id = $1
         ORDER BY st.domain, st.tag",
    )
    .bind(profile_id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rs) => {
            let skills: Vec<serde_json::Value> = rs
                .iter()
                .map(|r| {
                    let tag_id: Uuid = r.get("tag_id");
                    let tag: &str = r.get("tag");
                    let domain: &str = r.get("domain");
                    let proficiency: i16 = r.get("proficiency");
                    let verified_at: Option<chrono::DateTime<chrono::Utc>> = r.get("verified_at");
                    serde_json::json!({
                        "tag_id":      tag_id,
                        "tag":         tag,
                        "domain":      domain,
                        "proficiency": proficiency,
                        "verified_at": verified_at.map(|t| t.to_rfc3339()),
                    })
                })
                .collect();
            (
                StatusCode::OK,
                Json(serde_json::json!({ "skills": skills })),
            )
                .into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── PUT /talent-skills/:profile_id ────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct SkillEntry {
    pub tag_id: Uuid,
    pub proficiency: i16,
}

#[derive(Debug, Deserialize)]
pub struct PutTalentSkillsRequest {
    pub skills: Vec<SkillEntry>,
}

pub async fn put_talent_skills(
    State(state): State<SharedState>,
    Path(profile_id): Path<Uuid>,
    Json(req): Json<PutTalentSkillsRequest>,
) -> impl IntoResponse {
    let del = sqlx::query("DELETE FROM talent_skills WHERE talent_id = $1")
        .bind(profile_id)
        .execute(&state.db)
        .await;

    if let Err(e) = del {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    for entry in &req.skills {
        let ins = sqlx::query(
            "INSERT INTO talent_skills (talent_id, tag_id, proficiency)
             VALUES ($1, $2, $3)
             ON CONFLICT (talent_id, tag_id) DO UPDATE SET proficiency = EXCLUDED.proficiency",
        )
        .bind(profile_id)
        .bind(entry.tag_id)
        .bind(entry.proficiency)
        .execute(&state.db)
        .await;

        if let Err(e) = ins {
            return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({ "ok": true, "count": req.skills.len() })),
    )
        .into_response()
}

// ── POST /express-interest ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ExpressInterestRequest {
    pub agent_id: Uuid,
    pub profile_id: Uuid,
    pub required_skills: Vec<String>,
    pub min_trust_score: i16,
}

pub async fn express_interest(
    State(state): State<SharedState>,
    Json(req): Json<ExpressInterestRequest>,
) -> impl IntoResponse {
    let request_id = Uuid::new_v4();

    let ins = sqlx::query(
        "INSERT INTO match_requests
             (id, agent_id, required_skills, min_trust_score, applicant_id)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(request_id)
    .bind(req.agent_id)
    .bind(&req.required_skills)
    .bind(req.min_trust_score)
    .bind(req.profile_id)
    .execute(&state.db)
    .await;

    match ins {
        Ok(_) => (
            StatusCode::CREATED,
            Json(serde_json::json!({ "request_id": request_id })),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("express_interest: {e:#}");
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
        }
    }
}

// ── POST /talent-skills/:profile_id/attest ────────────────────────────────────
// Self-attestation: freelancer confirms all their listed skills are accurate.
// Sets verified_at = NOW() for every skill row owned by this talent.
// Logged in identity_audit_log via identity_service (fire-and-forget).

pub async fn attest_skills(
    State(state): State<SharedState>,
    Path(profile_id): Path<Uuid>,
) -> impl IntoResponse {
    let res = sqlx::query(
        "UPDATE talent_skills
         SET verified_at = NOW()
         WHERE talent_id = $1 AND verified_at IS NULL
         RETURNING tag_id",
    )
    .bind(profile_id)
    .fetch_all(&state.db)
    .await;

    match res {
        Ok(rows) => {
            let attested = rows.len();
            tracing::info!(%profile_id, %attested, "skills self-attested");
            (
                StatusCode::OK,
                Json(serde_json::json!({ "ok": true, "attested": attested })),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("attest_skills: {e:#}");
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
        }
    }
}

// ── GET /health ───────────────────────────────────────────────────────────────

pub async fn health() -> StatusCode {
    StatusCode::OK
}
