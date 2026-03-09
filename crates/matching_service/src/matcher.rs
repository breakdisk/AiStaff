use anyhow::Result;
use common::events::{MatchRequest, MatchResult, TalentMatch};
use sqlx::PgPool;

/// Jaccard-style match score: matched_skills / required_skills (clamped 0.0–1.0).
pub fn jaccard_score(matched: usize, required: usize) -> f32 {
    if required == 0 { return 0.0; }
    (matched as f32 / required as f32).min(1.0)
}

pub struct Matcher {
    pub db: PgPool,
}

impl Matcher {
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }

    /// Returns top-K talent matches using Jaccard similarity on skill tag sets.
    pub async fn find_matches(&self, req: &MatchRequest, top_k: usize) -> Result<MatchResult> {
        let rows = sqlx::query!(
            r#"
            SELECT
                ts.talent_id,
                COUNT(st.tag) FILTER (WHERE st.tag = ANY($1)) AS matched,
                up.trust_score
            FROM talent_skills ts
            JOIN skill_tags st        ON ts.tag_id = st.id
            JOIN unified_profiles up  ON ts.talent_id = up.id
            WHERE up.trust_score >= $2
            GROUP BY ts.talent_id, up.trust_score
            ORDER BY matched DESC, up.trust_score DESC
            LIMIT $3
            "#,
            &req.required_skills,
            req.min_trust_score as i32,
            top_k as i64,
        )
        .fetch_all(&self.db)
        .await?;

        let required_count = req.required_skills.len().max(1);
        let matches = rows
            .into_iter()
            .map(|r| TalentMatch {
                talent_id:   r.talent_id,
                match_score: jaccard_score(r.matched.unwrap_or(0) as usize, required_count),
                trust_score: r.trust_score,
                skill_tags:  req.required_skills.clone(),
            })
            .collect();

        Ok(MatchResult {
            request_id: req.request_id,
            matches,
        })
    }

    pub async fn upsert_skill(
        &self,
        talent_id:   uuid::Uuid,
        tag:         &str,
        domain:      &str,
        proficiency: i16,
    ) -> Result<()> {
        // Upsert skill_tag
        let tag_id: uuid::Uuid = sqlx::query_scalar!(
            "INSERT INTO skill_tags (id, tag, domain)
             VALUES (gen_random_uuid(), $1, $2)
             ON CONFLICT (tag) DO UPDATE SET domain = EXCLUDED.domain
             RETURNING id",
            tag,
            domain,
        )
        .fetch_one(&self.db)
        .await?;

        // Upsert talent_skill
        sqlx::query!(
            "INSERT INTO talent_skills (talent_id, tag_id, proficiency)
             VALUES ($1, $2, $3)
             ON CONFLICT (talent_id, tag_id) DO UPDATE SET proficiency = EXCLUDED.proficiency",
            talent_id,
            tag_id,
            proficiency,
        )
        .execute(&self.db)
        .await?;

        Ok(())
    }
}

#[cfg(test)]
mod trust_engine {
    use super::jaccard_score;

    #[test]
    fn perfect_match() {
        assert!((jaccard_score(5, 5) - 1.0).abs() < f32::EPSILON);
    }

    #[test]
    fn partial_match() {
        let s = jaccard_score(3, 5);
        assert!((s - 0.6).abs() < 0.001);
    }

    #[test]
    fn no_match() {
        assert_eq!(jaccard_score(0, 5), 0.0);
    }

    #[test]
    fn zero_required_returns_zero() {
        assert_eq!(jaccard_score(3, 0), 0.0);
    }

    #[test]
    fn clamps_at_one() {
        // matched > required should never exceed 1.0
        assert!((jaccard_score(10, 5) - 1.0).abs() < f32::EPSILON);
    }

    #[test]
    fn sow_threshold_boundary() {
        // SOW auto-proposes when score >= 0.85
        let below = jaccard_score(4, 5); // 0.80
        let above = jaccard_score(5, 5); // 1.00
        assert!(below < 0.85);
        assert!(above >= 0.85);
    }
}
