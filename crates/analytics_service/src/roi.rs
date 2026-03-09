use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct RoiReport {
    pub talent_id:              Uuid,
    pub total_deployments:      i64,
    pub total_earned_cents:     i64,
    pub avg_checklist_pass_pct: f64,
    pub drift_incidents:        i64,
    pub reputation_score:       f64,
}

/// Composite reputation score: 40% checklist pass rate + 30% drift-free rate + 30% trust/100
fn compute_reputation(pass_pct: f64, total: i64, drift: i64, trust: i16) -> f64 {
    let drift_rate     = if total > 0 { drift as f64 / total as f64 } else { 0.0 };
    let drift_free_pct = 1.0 - drift_rate;
    let trust_norm     = trust as f64 / 100.0;
    let score = 0.40 * pass_pct + 0.30 * drift_free_pct + 0.30 * trust_norm;
    (score * 100.0).clamp(0.0, 100.0)
}

/// Uses sqlx::query() (no macro) to avoid compile-time type inference on VIEWs.
pub async fn talent_roi(db: &PgPool, talent_id: Uuid) -> Result<RoiReport> {
    let row = sqlx::query(
        "SELECT total_deployments, total_earned_cents, avg_checklist_pass_pct, drift_incidents
         FROM talent_roi WHERE talent_id = $1"
    )
    .bind(talent_id)
    .fetch_optional(db)
    .await?;

    let trust: i16 = sqlx::query(
        "SELECT trust_score FROM unified_profiles WHERE id = $1"
    )
    .bind(talent_id)
    .fetch_optional(db)
    .await?
    .map(|r: sqlx::postgres::PgRow| r.get::<i16, _>("trust_score"))
    .unwrap_or(0);

    match row {
        Some(r) => {
            let total    = r.try_get::<i64, _>("total_deployments").unwrap_or(0);
            let earned   = r.try_get::<i64, _>("total_earned_cents").unwrap_or(0);
            let pass_pct = r.try_get::<f64, _>("avg_checklist_pass_pct").unwrap_or(0.0);
            let drift    = r.try_get::<i64, _>("drift_incidents").unwrap_or(0);
            let rep      = compute_reputation(pass_pct, total, drift, trust);
            Ok(RoiReport {
                talent_id,
                total_deployments:      total,
                total_earned_cents:     earned,
                avg_checklist_pass_pct: pass_pct,
                drift_incidents:        drift,
                reputation_score:       rep,
            })
        }
        None => Ok(RoiReport {
            talent_id,
            total_deployments:      0,
            total_earned_cents:     0,
            avg_checklist_pass_pct: 0.0,
            drift_incidents:        0,
            reputation_score:       compute_reputation(0.0, 0, 0, trust),
        }),
    }
}

pub async fn leaderboard(db: &PgPool, limit: i64) -> Result<Vec<RoiReport>> {
    let rows = sqlx::query(
        "SELECT tr.talent_id,
                tr.total_deployments,
                tr.total_earned_cents,
                tr.avg_checklist_pass_pct,
                tr.drift_incidents,
                COALESCE(up.trust_score, 0) AS trust_score
         FROM talent_roi tr
         LEFT JOIN unified_profiles up ON up.id = tr.talent_id
         ORDER BY tr.total_deployments DESC
         LIMIT $1"
    )
    .bind(limit)
    .fetch_all(db)
    .await?;

    let mut reports: Vec<RoiReport> = rows
        .iter()
        .map(|r| {
            let talent_id = r.get::<Uuid, _>("talent_id");
            let total     = r.try_get::<i64, _>("total_deployments").unwrap_or(0);
            let earned    = r.try_get::<i64, _>("total_earned_cents").unwrap_or(0);
            let pass_pct  = r.try_get::<f64, _>("avg_checklist_pass_pct").unwrap_or(0.0);
            let drift     = r.try_get::<i64, _>("drift_incidents").unwrap_or(0);
            let trust     = r.try_get::<i16, _>("trust_score").unwrap_or(0);
            let rep       = compute_reputation(pass_pct, total, drift, trust);
            RoiReport {
                talent_id,
                total_deployments:      total,
                total_earned_cents:     earned,
                avg_checklist_pass_pct: pass_pct,
                drift_incidents:        drift,
                reputation_score:       rep,
            }
        })
        .collect();

    reports.sort_by(|a, b| b.reputation_score.partial_cmp(&a.reputation_score).unwrap());
    Ok(reports)
}
