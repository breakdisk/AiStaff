use crate::vc_issuer::issue_reputation_vc;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use common::events::{EventEnvelope, ReputationExported, TOPIC_REPUTATION_COMMANDS};
use common::kafka::producer::KafkaProducer;
use sqlx::{PgPool, Row};
use std::sync::Arc;
use uuid::Uuid;

pub struct AppState {
    pub db: PgPool,
    pub producer: KafkaProducer,
    pub platform_did: String,
}

pub async fn export_vc(
    State(state): State<Arc<AppState>>,
    Path(talent_id): Path<Uuid>,
) -> impl IntoResponse {
    // Non-macro query to avoid compile-time type-inference issues with VIEWs.
    let row = sqlx::query(
        "SELECT
             COALESCE(tr.total_deployments, 0)       AS total_deployments,
             COALESCE(tr.avg_checklist_pass_pct, 0)  AS avg_checklist_pass_pct,
             COALESCE(tr.drift_incidents, 0)         AS drift_incidents,
             COALESCE(up.trust_score, 0)             AS trust_score,
             up.identity_tier::TEXT                  AS tier
         FROM unified_profiles up
         LEFT JOIN talent_roi tr ON tr.talent_id = up.id
         WHERE up.id = $1",
    )
    .bind(talent_id)
    .fetch_optional(&state.db)
    .await;

    let row = match row {
        Ok(Some(r)) => r,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let total = row.try_get::<i64, _>("total_deployments").unwrap_or(0);
    let pass_pct = row
        .try_get::<f64, _>("avg_checklist_pass_pct")
        .unwrap_or(0.0);
    let drift = row.try_get::<i64, _>("drift_incidents").unwrap_or(0);
    let trust = row.try_get::<i16, _>("trust_score").unwrap_or(0) as f64;
    let drift_free = if total > 0 {
        1.0 - drift as f64 / total as f64
    } else {
        1.0
    };
    let rep_score = reputation_score(pass_pct, drift_free, trust);
    let tier = row
        .try_get::<String, _>("tier")
        .unwrap_or_else(|_| "Unverified".into());

    let vc = issue_reputation_vc(
        talent_id,
        rep_score.clamp(0.0, 100.0),
        total,
        &tier,
        &state.platform_did,
    );
    let vc_jwt = serde_json::to_string(&vc).unwrap_or_default();

    // Persist the VC for later retrieval.
    sqlx::query!(
        "INSERT INTO reputation_vcs (id, talent_id, vc_jwt, issued_at)
         VALUES (gen_random_uuid(), $1, $2, NOW())
         ON CONFLICT (talent_id) DO UPDATE SET vc_jwt = EXCLUDED.vc_jwt, issued_at = NOW()",
        talent_id,
        vc_jwt,
    )
    .execute(&state.db)
    .await
    .ok();

    // Emit reputation exported event.
    let event = ReputationExported {
        talent_id,
        vc_jwt: vc_jwt.clone(),
        issued_at: Utc::now(),
    };
    state
        .producer
        .publish(
            TOPIC_REPUTATION_COMMANDS,
            &talent_id.to_string(),
            &EventEnvelope::new("ReputationExported", &event),
        )
        .await
        .ok();

    (StatusCode::OK, Json(vc)).into_response()
}

pub async fn get_vc(
    State(state): State<Arc<AppState>>,
    Path(talent_id): Path<Uuid>,
) -> impl IntoResponse {
    let row = sqlx::query_scalar!(
        "SELECT vc_jwt FROM reputation_vcs WHERE talent_id = $1",
        talent_id
    )
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(jwt)) => (StatusCode::OK, jwt).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn health() -> StatusCode {
    StatusCode::OK
}

/// Pure reputation score formula (0–100).
/// Weights: 40% checklist pass rate · 30% drift-free rate · 30% trust score.
pub fn reputation_score(pass_pct: f64, drift_free: f64, trust_score: f64) -> f64 {
    (0.40 * pass_pct + 0.30 * drift_free + 0.30 * trust_score / 100.0) * 100.0
}

#[cfg(test)]
mod trust_engine {
    use super::reputation_score;

    #[test]
    fn perfect_score() {
        // 100% pass, 0 drift, trust=100 → 100.0
        let s = reputation_score(1.0, 1.0, 100.0);
        assert!((s - 100.0).abs() < 0.001);
    }

    #[test]
    fn zero_score() {
        let s = reputation_score(0.0, 0.0, 0.0);
        assert!((s - 0.0).abs() < 0.001);
    }

    #[test]
    fn weights_sum_correctly() {
        // Each component at 50% → score should be 50.0
        let s = reputation_score(0.5, 0.5, 50.0);
        assert!((s - 50.0).abs() < 0.001);
    }

    #[test]
    fn trust_only() {
        // Only trust matters (others zero): 30% × (trust/100) × 100
        let s = reputation_score(0.0, 0.0, 80.0);
        assert!((s - 24.0).abs() < 0.001); // 0.30 * 0.80 * 100 = 24.0
    }

    #[test]
    fn drift_free_only() {
        let s = reputation_score(0.0, 1.0, 0.0);
        assert!((s - 30.0).abs() < 0.001); // 0.30 * 1.0 * 100 = 30.0
    }
}
