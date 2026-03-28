// crates/marketplace_service/src/proposal_handlers.rs
//
// State type: SharedState = Arc<AppState>  (see handlers.rs line 26)
// Kafka: state.producer.publish(TOPIC, &key, &EventEnvelope::new("TypeName", &payload))
// Queries: non-macro sqlx::query() + .bind() — no .sqlx/ cache dependency

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use common::events::{DeploymentStarted, EventEnvelope, TOPIC_DEPLOYMENT_STARTED};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::handlers::SharedState;

// ── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ProposalRow {
    pub id: String,
    pub job_listing_id: Option<String>,
    pub freelancer_id: Option<String>,
    pub freelancer_email: String,
    pub job_title: String,
    pub cover_letter: String,
    pub proposed_budget: String,
    pub proposed_timeline: String,
    pub status: String,
    pub submitted_at: String,
}

#[derive(Debug, Deserialize)]
pub struct AcceptProposalRequest {
    pub transaction_id: Uuid,
    pub escrow_amount_cents: i64,
    pub milestones: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct AcceptProposalResponse {
    pub deployment_id: String,
    pub milestone_count: usize,
}

#[derive(Debug, Deserialize)]
pub struct RejectProposalRequest {
    pub reason: Option<String>,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

pub async fn list_proposals_for_job(
    State(state): State<SharedState>,
    Path(listing_id): Path<Uuid>,
) -> Result<Json<Vec<ProposalRow>>, (StatusCode, String)> {
    let rows = sqlx::query(
        r#"
        SELECT id::TEXT, job_listing_id::TEXT, freelancer_id::TEXT,
               freelancer_email, job_title, cover_letter,
               proposed_budget, proposed_timeline, status,
               submitted_at::TEXT
        FROM proposals
        WHERE job_listing_id = $1
        ORDER BY submitted_at DESC
        "#,
    )
    .bind(listing_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let proposals = rows
        .iter()
        .map(|r| ProposalRow {
            id: r.try_get("id").unwrap_or_default(),
            job_listing_id: r.try_get("job_listing_id").unwrap_or(None),
            freelancer_id: r.try_get("freelancer_id").unwrap_or(None),
            freelancer_email: r.try_get("freelancer_email").unwrap_or_default(),
            job_title: r.try_get("job_title").unwrap_or_default(),
            cover_letter: r.try_get("cover_letter").unwrap_or_default(),
            proposed_budget: r.try_get("proposed_budget").unwrap_or_default(),
            proposed_timeline: r.try_get("proposed_timeline").unwrap_or_default(),
            status: r.try_get("status").unwrap_or_default(),
            submitted_at: r.try_get("submitted_at").unwrap_or_default(),
        })
        .collect();

    Ok(Json(proposals))
}

pub async fn accept_proposal(
    State(state): State<SharedState>,
    Path(proposal_id): Path<Uuid>,
    Json(req): Json<AcceptProposalRequest>,
) -> Result<Json<AcceptProposalResponse>, (StatusCode, String)> {
    let row = sqlx::query(
        "SELECT id, freelancer_id, job_listing_id, status FROM proposals WHERE id = $1",
    )
    .bind(proposal_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((StatusCode::NOT_FOUND, "Proposal not found".to_string()))?;

    let status: String = row.try_get("status").unwrap_or_default();
    if status != "PENDING" {
        return Err((
            StatusCode::CONFLICT,
            format!("Proposal is already {status}"),
        ));
    }

    let freelancer_id: Option<Uuid> = row.try_get("freelancer_id").unwrap_or(None);
    let job_listing_id: Option<Uuid> = row.try_get("job_listing_id").unwrap_or(None);

    let existing = sqlx::query("SELECT id::TEXT FROM deployments WHERE transaction_id = $1")
        .bind(req.transaction_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Some(row) = existing {
        let dep_id: String = row.try_get("id").unwrap_or_default();
        return Ok(Json(AcceptProposalResponse {
            deployment_id: dep_id,
            milestone_count: req.milestones.len(),
        }));
    }

    let now = Utc::now();
    let deployment_id = Uuid::now_v7();
    let fl_id = freelancer_id.unwrap_or(Uuid::nil());
    let listing_id = job_listing_id.unwrap_or(Uuid::nil());

    sqlx::query(
        r#"
        INSERT INTO deployments
            (id, agent_id, client_id, freelancer_id, agent_artifact_hash,
             escrow_amount_cents, total_amount_cents, state, transaction_id,
             deployment_type, created_at, updated_at)
        VALUES
            ($1, $2, $3, $4, 'talent-engagement',
             $5, $5, 'PENDING'::deployment_status, $6,
             'TALENT', $7, $7)
        "#,
    )
    .bind(deployment_id)
    .bind(listing_id)
    .bind(Uuid::nil())
    .bind(fl_id)
    .bind(req.escrow_amount_cents)
    .bind(req.transaction_id)
    .bind(now)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    sqlx::query(
        "UPDATE proposals SET status = 'ACCEPTED', deployment_id = $1, accepted_at = $2 WHERE id = $3",
    )
    .bind(deployment_id)
    .bind(now)
    .bind(proposal_id)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Some(lid) = job_listing_id {
        sqlx::query(
            "UPDATE proposals SET status = 'REJECTED', rejected_at = $1 WHERE job_listing_id = $2 AND id != $3 AND status = 'PENDING'",
        )
        .bind(now)
        .bind(lid)
        .bind(proposal_id)
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    let milestone_count = req.milestones.len();
    for (i, label) in req.milestones.iter().enumerate() {
        let step_id = format!("milestone_{}", i + 1);
        sqlx::query(
            r#"
            INSERT INTO dod_checklist_steps
                (id, deployment_id, step_id, step_label, passed)
            VALUES (gen_random_uuid(), $1, $2, $3, FALSE)
            ON CONFLICT (deployment_id, step_id) DO NOTHING
            "#,
        )
        .bind(deployment_id)
        .bind(&step_id)
        .bind(label)
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    let event = DeploymentStarted {
        deployment_id,
        agent_id: listing_id,
        client_id: Uuid::nil(),
        freelancer_id: fl_id,
    };
    if let Err(e) = state
        .producer
        .publish(
            TOPIC_DEPLOYMENT_STARTED,
            &deployment_id.to_string(),
            &EventEnvelope::new("DeploymentStarted", &event),
        )
        .await
    {
        tracing::warn!("Failed to emit DeploymentStarted: {e}");
    }

    Ok(Json(AcceptProposalResponse {
        deployment_id: deployment_id.to_string(),
        milestone_count,
    }))
}

pub async fn reject_proposal(
    State(state): State<SharedState>,
    Path(proposal_id): Path<Uuid>,
    Json(req): Json<RejectProposalRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let result = sqlx::query(
        "UPDATE proposals SET status = 'REJECTED', rejected_at = NOW() WHERE id = $1 AND status = 'PENDING'",
    )
    .bind(proposal_id)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if result.rows_affected() == 0 {
        return Err((
            StatusCode::CONFLICT,
            "Proposal already processed".to_string(),
        ));
    }

    if let Some(reason) = req.reason {
        tracing::info!("Proposal {proposal_id} rejected: {reason}");
    }

    Ok(StatusCode::NO_CONTENT)
}

/// Pure function — maps DB `status` value to Kanban column name.
pub fn proposal_kanban_group(status: &str) -> &'static str {
    match status {
        "DRAFT" => "draft",
        "PENDING" | "ACCEPTED" => "sent",
        _ => "closed",
    }
}

#[derive(Debug, Serialize)]
pub struct OrgProposalItem {
    pub id: String,
    pub job_title: String,
    pub freelancer_email: String,
    pub client_email: String,
    pub submitted_at: String,
    pub submitted_by_profile_id: Option<String>,
    pub submitter_name: Option<String>,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct OrgProposalsResponse {
    pub draft: Vec<OrgProposalItem>,
    pub sent: Vec<OrgProposalItem>,
    pub closed: Vec<OrgProposalItem>,
}

/// GET /enterprise/orgs/:id/proposals
///
/// ADMIN sees all proposals from any org member.
/// MEMBER sees only their own proposals.
/// Returns 403 if caller is not a member of the org.
///
/// The `caller_profile_id` query parameter is the profile UUID of the
/// authenticated user (passed from the Next.js proxy layer).
pub async fn list_org_proposals(
    State(state): State<SharedState>,
    Path(org_id): Path<Uuid>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let caller_profile_id_str = match params.get("caller_profile_id") {
        Some(s) => s.clone(),
        None => return (StatusCode::BAD_REQUEST, "caller_profile_id required").into_response(),
    };
    let caller_id: Uuid = match caller_profile_id_str.parse() {
        Ok(id) => id,
        Err(_) => return (StatusCode::BAD_REQUEST, "invalid caller_profile_id").into_response(),
    };

    // Resolve caller's membership role — 403 if not a member
    let membership =
        sqlx::query("SELECT member_role FROM org_members WHERE org_id = $1 AND profile_id = $2")
            .bind(org_id)
            .bind(caller_id)
            .fetch_optional(&state.db)
            .await;

    let member_role: String = match membership {
        Ok(Some(r)) => r.get("member_role"),
        Ok(None) => return StatusCode::FORBIDDEN.into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    // Build query: ADMIN sees all org members' proposals, MEMBER sees own only
    let rows = if member_role == "ADMIN" {
        sqlx::query(
            "SELECT p.id, p.job_title, p.freelancer_email, p.client_email,
                    p.submitted_at, p.status,
                    p.submitted_by_profile_id,
                    up.display_name AS submitter_name
             FROM proposals p
             LEFT JOIN unified_profiles up ON up.id = p.submitted_by_profile_id
             WHERE p.submitted_by_profile_id IN (
                 SELECT profile_id FROM org_members WHERE org_id = $1
             )
             ORDER BY p.submitted_at DESC",
        )
        .bind(org_id)
        .fetch_all(&state.db)
        .await
    } else {
        sqlx::query(
            "SELECT p.id, p.job_title, p.freelancer_email, p.client_email,
                    p.submitted_at, p.status,
                    p.submitted_by_profile_id,
                    up.display_name AS submitter_name
             FROM proposals p
             LEFT JOIN unified_profiles up ON up.id = p.submitted_by_profile_id
             WHERE p.submitted_by_profile_id = $1
             ORDER BY p.submitted_at DESC",
        )
        .bind(caller_id)
        .fetch_all(&state.db)
        .await
    };

    let rows = match rows {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut draft: Vec<OrgProposalItem> = Vec::new();
    let mut sent: Vec<OrgProposalItem> = Vec::new();
    let mut closed: Vec<OrgProposalItem> = Vec::new();

    for r in &rows {
        let status: String = r.get("status");
        let item = OrgProposalItem {
            id: r.get::<Uuid, _>("id").to_string(),
            job_title: r.get("job_title"),
            freelancer_email: r.get("freelancer_email"),
            client_email: r.get("client_email"),
            submitted_at: r
                .get::<chrono::DateTime<chrono::Utc>, _>("submitted_at")
                .to_rfc3339(),
            submitted_by_profile_id: r
                .get::<Option<Uuid>, _>("submitted_by_profile_id")
                .map(|u| u.to_string()),
            submitter_name: r.get("submitter_name"),
            status: status.clone(),
        };

        match proposal_kanban_group(&status) {
            "draft" => draft.push(item),
            "sent" => sent.push(item),
            _ => closed.push(item),
        }
    }

    (
        StatusCode::OK,
        Json(OrgProposalsResponse {
            draft,
            sent,
            closed,
        }),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::proposal_kanban_group;

    #[test]
    fn draft_maps_to_draft() {
        assert_eq!(proposal_kanban_group("DRAFT"), "draft");
    }

    #[test]
    fn pending_and_accepted_map_to_sent() {
        assert_eq!(proposal_kanban_group("PENDING"), "sent");
        assert_eq!(proposal_kanban_group("ACCEPTED"), "sent");
    }

    #[test]
    fn rejected_maps_to_closed() {
        assert_eq!(proposal_kanban_group("REJECTED"), "closed");
    }
}
