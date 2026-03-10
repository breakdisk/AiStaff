use crate::{
    matcher::Matcher,
    orchestrator::{SowOrchestrator, SOW_THRESHOLD},
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use common::events::MatchRequest;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

pub struct AppState {
    pub matcher: Matcher,
    pub orchestrator: SowOrchestrator,
}

pub type SharedState = Arc<AppState>;

pub async fn match_talent(
    State(state): State<SharedState>,
    Json(req): Json<MatchRequest>,
) -> impl IntoResponse {
    let result = match state.matcher.find_matches(&req, 5).await {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    // Bot Orchestrator: fire-and-forget SOW proposals for high-confidence matches.
    for m in result
        .matches
        .iter()
        .filter(|m| m.match_score >= SOW_THRESHOLD)
    {
        let orch = state.orchestrator.clone();
        let db = state.matcher.db.clone();
        let agent_id = req.agent_id;
        let talent_id = m.talent_id;
        let score = m.match_score;

        tokio::spawn(async move {
            let dev_id: Option<uuid::Uuid> =
                sqlx::query_scalar("SELECT developer_id FROM agent_listings WHERE id = $1")
                    .bind(agent_id)
                    .fetch_optional(&db)
                    .await
                    .ok()
                    .flatten();

            if let Some(developer_id) = dev_id {
                orch.propose_sow(agent_id, developer_id, talent_id, score)
                    .await;
            } else {
                tracing::warn!(%agent_id, "agent not found in listings — skipping SOW proposal");
            }
        });
    }

    (StatusCode::OK, Json(result)).into_response()
}

#[derive(Deserialize)]
pub struct SkillUpsert {
    pub tag: String,
    pub domain: String,
    pub proficiency: i16,
}

#[derive(Serialize)]
pub struct SkillResponse {
    pub upserted: bool,
}

pub async fn upsert_skill(
    State(state): State<SharedState>,
    Path(talent_id): Path<Uuid>,
    Json(req): Json<SkillUpsert>,
) -> impl IntoResponse {
    match state
        .matcher
        .upsert_skill(talent_id, &req.tag, &req.domain, req.proficiency)
        .await
    {
        Ok(_) => (StatusCode::OK, Json(SkillResponse { upserted: true })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn get_talent_skills(
    State(state): State<SharedState>,
    Path(talent_id): Path<Uuid>,
) -> impl IntoResponse {
    let rows = sqlx::query!(
        "SELECT st.tag, st.domain, ts.proficiency
         FROM talent_skills ts
         JOIN skill_tags st ON ts.tag_id = st.id
         WHERE ts.talent_id = $1",
        talent_id
    )
    .fetch_all(&state.matcher.db)
    .await;

    match rows {
        Ok(rows) => {
            let skills: Vec<_> = rows
                .iter()
                .map(|r| {
                    serde_json::json!({
                        "tag":         r.tag,
                        "domain":      r.domain,
                        "proficiency": r.proficiency,
                    })
                })
                .collect();
            (StatusCode::OK, Json(skills)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn health() -> StatusCode {
    StatusCode::OK
}
