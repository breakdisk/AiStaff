// crates/checklist_service/src/milestone_handlers.rs

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use common::events::{
    ChecklistFinalized, DeploymentComplete, EventEnvelope, TOPIC_CHECKLIST_EVENTS,
    TOPIC_DEPLOYMENT_COMPLETE,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::handlers::AppState;

#[derive(Debug, Deserialize)]
pub struct SubmitMilestoneRequest {
    pub freelancer_id: Uuid,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ApproveMilestoneRequest {
    pub client_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct MilestoneStatus {
    pub step_id: String,
    pub step_label: String,
    pub passed: bool,
    pub submitted_at: Option<String>,
    pub approved_at: Option<String>,
    pub notes: Option<String>,
}

/// GET /checklist/:deployment_id/milestones
pub async fn list_milestones(
    State(svc): State<AppState>,
    Path(deployment_id): Path<Uuid>,
) -> Result<Json<Vec<MilestoneStatus>>, (StatusCode, String)> {
    let rows = sqlx::query(
        r#"
        SELECT step_id, step_label, passed,
               submitted_at::TEXT, approved_at::TEXT, notes
        FROM dod_checklist_steps
        WHERE deployment_id = $1
        ORDER BY step_id ASC
        "#,
    )
    .bind(deployment_id)
    .fetch_all(&svc.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let milestones = rows
        .iter()
        .map(|r| MilestoneStatus {
            step_id: r.try_get("step_id").unwrap_or_default(),
            step_label: r.try_get("step_label").unwrap_or_default(),
            passed: r.try_get("passed").unwrap_or(false),
            submitted_at: r.try_get("submitted_at").unwrap_or(None),
            approved_at: r.try_get("approved_at").unwrap_or(None),
            notes: r.try_get("notes").unwrap_or(None),
        })
        .collect();

    Ok(Json(milestones))
}

/// POST /checklist/:deployment_id/step/:step_id/submit
/// Freelancer marks work as submitted for a milestone.
pub async fn submit_milestone(
    State(svc): State<AppState>,
    Path((deployment_id, step_id)): Path<(Uuid, String)>,
    Json(req): Json<SubmitMilestoneRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let now = Utc::now();

    let result = sqlx::query(
        r#"
        UPDATE dod_checklist_steps
        SET submitted_by = $1, submitted_at = $2,
            notes = COALESCE($3, notes)
        WHERE deployment_id = $4 AND step_id = $5
          AND submitted_at IS NULL
        "#,
    )
    .bind(req.freelancer_id)
    .bind(now)
    .bind(req.notes)
    .bind(deployment_id)
    .bind(&step_id)
    .execute(&svc.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if result.rows_affected() == 0 {
        tracing::warn!(%deployment_id, %step_id, "submit_milestone: already submitted or step not found");
    }

    Ok(StatusCode::NO_CONTENT)
}

/// POST /checklist/:deployment_id/step/:step_id/approve
/// Client approves a submitted milestone.
/// When ALL milestones approved: emits ChecklistFinalized + DeploymentComplete
/// (triggers payout_service 30s veto window).
pub async fn approve_milestone(
    State(svc): State<AppState>,
    Path((deployment_id, step_id)): Path<(Uuid, String)>,
    Json(req): Json<ApproveMilestoneRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let now = Utc::now();

    let result = sqlx::query(
        r#"
        UPDATE dod_checklist_steps
        SET approved_by = $1, approved_at = $2,
            passed = TRUE, completed_at = $2
        WHERE deployment_id = $3 AND step_id = $4
          AND submitted_at IS NOT NULL
          AND approved_at IS NULL
        "#,
    )
    .bind(req.client_id)
    .bind(now)
    .bind(deployment_id)
    .bind(&step_id)
    .execute(&svc.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if result.rows_affected() == 0 {
        return Err((
            StatusCode::CONFLICT,
            "Milestone not submitted, already approved, or not found".to_string(),
        ));
    }

    let total: i64 =
        sqlx::query("SELECT COUNT(*)::BIGINT FROM dod_checklist_steps WHERE deployment_id = $1")
            .bind(deployment_id)
            .fetch_one(&svc.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
            .try_get(0)
            .unwrap_or(0);

    let approved: i64 = sqlx::query(
        "SELECT COUNT(*)::BIGINT FROM dod_checklist_steps WHERE deployment_id = $1 AND passed = TRUE",
    )
    .bind(deployment_id)
    .fetch_one(&svc.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .try_get(0)
    .unwrap_or(0);

    if total > 0 && total == approved {
        sqlx::query(
            r#"
            INSERT INTO dod_checklist_summaries
                (deployment_id, all_passed, failed_steps, finalized_at)
            VALUES ($1, TRUE, ARRAY[]::TEXT[], $2)
            ON CONFLICT (deployment_id) DO UPDATE
              SET all_passed = TRUE,
                  failed_steps = ARRAY[]::TEXT[],
                  finalized_at = $2
            "#,
        )
        .bind(deployment_id)
        .bind(now)
        .execute(&svc.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        let finalized = ChecklistFinalized {
            deployment_id,
            all_passed: true,
            failed_steps: vec![],
        };
        if let Err(e) = svc
            .producer
            .publish(
                TOPIC_CHECKLIST_EVENTS,
                &deployment_id.to_string(),
                &EventEnvelope::new("ChecklistFinalized", &finalized),
            )
            .await
        {
            tracing::warn!("Failed to emit ChecklistFinalized: {e}");
        }

        let dep = sqlx::query(
            "SELECT developer_id, freelancer_id, escrow_amount_cents, agent_artifact_hash FROM deployments WHERE id = $1",
        )
        .bind(deployment_id)
        .fetch_optional(&svc.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        if let Some(row) = dep {
            let developer_id: Option<Uuid> = row.try_get("developer_id").unwrap_or(None);
            let freelancer_id: Uuid = row.try_get("freelancer_id").unwrap_or(Uuid::nil());
            let escrow_cents: i64 = row.try_get("escrow_amount_cents").unwrap_or(0);
            let artifact_hash: String = row.try_get("agent_artifact_hash").unwrap_or_default();

            let complete = DeploymentComplete {
                deployment_id,
                developer_id: developer_id.unwrap_or(freelancer_id),
                talent_id: freelancer_id,
                total_cents: escrow_cents as u64,
                artifact_hash,
            };
            if let Err(e) = svc
                .producer
                .publish(
                    TOPIC_DEPLOYMENT_COMPLETE,
                    &deployment_id.to_string(),
                    &EventEnvelope::new("DeploymentComplete", &complete),
                )
                .await
            {
                tracing::warn!("Failed to emit DeploymentComplete: {e}");
            }

            tracing::info!(
                %deployment_id,
                "All milestones approved — DeploymentComplete emitted, 30s veto window starting"
            );
        }
    }

    Ok(StatusCode::NO_CONTENT)
}
