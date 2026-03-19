use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct RoiReport {
    pub talent_id:              Uuid,
    pub display_name:           String,
    pub total_deployments:      i64,
    pub total_earned_cents:     i64,
    pub avg_checklist_pass_pct: f64,
    pub drift_incidents:        i64,
    pub reputation_score:       f64,
}

/// Composite reputation score — weights match the UI legend:
///   40% checklist pass rate
///   30% drift-free rate  (1 − drift_incidents / total_deployments)
///   20% trust score      (0–100 normalised to 0–1)
///   10% volume           (deployments / 50, capped at 1.0)
fn compute_reputation(pass_pct: f64, total: i64, drift: i64, trust: i16) -> f64 {
    let drift_rate     = if total > 0 { drift as f64 / total as f64 } else { 0.0 };
    let drift_free_pct = 1.0 - drift_rate;
    let trust_norm     = trust as f64 / 100.0;
    let vol_norm       = (total.min(50) as f64) / 50.0;
    let score = 0.40 * pass_pct
              + 0.30 * drift_free_pct
              + 0.20 * trust_norm
              + 0.10 * vol_norm;
    (score * 100.0).clamp(0.0, 100.0)
}

pub async fn talent_roi(db: &PgPool, talent_id: Uuid) -> Result<RoiReport> {
    // Single query: join the VIEW with unified_profiles for trust + display_name.
    let row = sqlx::query(
        "SELECT tr.total_deployments, tr.total_earned_cents,
                tr.avg_checklist_pass_pct, tr.drift_incidents,
                COALESCE(up.trust_score,  0)  AS trust_score,
                COALESCE(up.display_name, '') AS display_name
           FROM talent_roi tr
           LEFT JOIN unified_profiles up ON up.id = tr.talent_id
          WHERE tr.talent_id = $1",
    )
    .bind(talent_id)
    .fetch_optional(db)
    .await?;

    match row {
        Some(r) => {
            let total        = r.try_get::<i64, _>("total_deployments").unwrap_or(0);
            let earned       = r.try_get::<i64, _>("total_earned_cents").unwrap_or(0);
            let pass_pct     = r.try_get::<f64, _>("avg_checklist_pass_pct").unwrap_or(0.0);
            let drift        = r.try_get::<i64, _>("drift_incidents").unwrap_or(0);
            let trust        = r.try_get::<i16, _>("trust_score").unwrap_or(0);
            let display_name = r.try_get::<String, _>("display_name").unwrap_or_default();
            Ok(RoiReport {
                talent_id,
                display_name,
                total_deployments:      total,
                total_earned_cents:     earned,
                avg_checklist_pass_pct: pass_pct,
                drift_incidents:        drift,
                reputation_score:       compute_reputation(pass_pct, total, drift, trust),
            })
        }
        None => {
            // No deployments yet — fetch profile data directly.
            let profile = sqlx::query(
                "SELECT trust_score, display_name FROM unified_profiles WHERE id = $1",
            )
            .bind(talent_id)
            .fetch_optional(db)
            .await?;

            let (trust, display_name) = profile
                .map(|r| (
                    r.get::<i16, _>("trust_score"),
                    r.get::<String, _>("display_name"),
                ))
                .unwrap_or((0, String::new()));

            Ok(RoiReport {
                talent_id,
                display_name,
                total_deployments:      0,
                total_earned_cents:     0,
                avg_checklist_pass_pct: 0.0,
                drift_incidents:        0,
                reputation_score:       compute_reputation(0.0, 0, 0, trust),
            })
        }
    }
}

pub async fn leaderboard(db: &PgPool, limit: i64) -> Result<Vec<RoiReport>> {
    let rows = sqlx::query(
        "SELECT tr.talent_id,
                tr.total_deployments,
                tr.total_earned_cents,
                tr.avg_checklist_pass_pct,
                tr.drift_incidents,
                COALESCE(up.trust_score,  0)  AS trust_score,
                COALESCE(up.display_name, '') AS display_name
           FROM talent_roi tr
           LEFT JOIN unified_profiles up ON up.id = tr.talent_id
          ORDER BY tr.total_deployments DESC
          LIMIT $1",
    )
    .bind(limit)
    .fetch_all(db)
    .await?;

    let mut reports: Vec<RoiReport> = rows
        .iter()
        .map(|r| {
            let talent_id    = r.get::<Uuid, _>("talent_id");
            let total        = r.try_get::<i64, _>("total_deployments").unwrap_or(0);
            let earned       = r.try_get::<i64, _>("total_earned_cents").unwrap_or(0);
            let pass_pct     = r.try_get::<f64, _>("avg_checklist_pass_pct").unwrap_or(0.0);
            let drift        = r.try_get::<i64, _>("drift_incidents").unwrap_or(0);
            let trust        = r.try_get::<i16, _>("trust_score").unwrap_or(0);
            let display_name = r.try_get::<String, _>("display_name").unwrap_or_default();
            RoiReport {
                talent_id,
                display_name,
                total_deployments:      total,
                total_earned_cents:     earned,
                avg_checklist_pass_pct: pass_pct,
                drift_incidents:        drift,
                reputation_score:       compute_reputation(pass_pct, total, drift, trust),
            }
        })
        .collect();

    reports.sort_by(|a, b| {
        b.reputation_score
            .partial_cmp(&a.reputation_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(reports)
}
