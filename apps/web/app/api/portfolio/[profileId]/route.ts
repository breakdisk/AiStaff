export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface PortfolioData {
  id:                     string;
  name_initial:           string;
  identity_tier:          number;
  trust_score:            number;
  bio:                    string | null;
  hourly_rate_cents:      number;
  skills:                 string[];
  total_deployments:      number;
  total_earned_cents:     number;
  avg_checklist_pass_pct: number;
  drift_incidents:        number;
  avg_rating:             number | null;
  review_count:           number;
  recent_reviews:         { rating: number; body: string | null; created_at: string }[];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ profileId: string }> },
): Promise<NextResponse> {
  const { profileId } = await params;

  const client = await pool.connect();
  try {
    const [profileRes, skillsRes, statsRes, reviewsRes] = await Promise.all([
      client.query(
        `SELECT
           id,
           LEFT(email, 1)            AS name_initial,
           CASE identity_tier
             WHEN 'BIOMETRIC_VERIFIED' THEN 2
             WHEN 'SOCIAL_VERIFIED'    THEN 1
             ELSE 0
           END                        AS identity_tier,
           COALESCE(trust_score,   0) AS trust_score,
           bio,
           COALESCE(hourly_rate_cents, 0) AS hourly_rate_cents
         FROM unified_profiles
        WHERE id = $1`,
        [profileId],
      ),

      client.query(
        `SELECT st.tag AS name
           FROM talent_skills ts
           JOIN skill_tags    st ON st.id = ts.tag_id
          WHERE ts.talent_id = $1
          ORDER BY st.tag`,
        [profileId],
      ),

      client.query(
        `SELECT
           COALESCE(total_deployments,      0) AS total_deployments,
           COALESCE(total_earned_cents,     0) AS total_earned_cents,
           COALESCE(avg_checklist_pass_pct, 0) AS avg_checklist_pass_pct,
           COALESCE(drift_incidents,        0) AS drift_incidents
         FROM talent_roi
        WHERE talent_id = $1`,
        [profileId],
      ),

      client.query(
        `SELECT dr.rating, dr.body, dr.created_at
           FROM deployment_reviews dr
           JOIN deployments dep ON dep.id = dr.deployment_id
          WHERE dep.freelancer_id = $1
            AND dr.reviewer_id   != $1
          ORDER BY dr.created_at DESC
          LIMIT 5`,
        [profileId],
      ),
    ]);

    if (profileRes.rows.length === 0) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const p    = profileRes.rows[0];
    const stat = statsRes.rows[0];

    const avgRating = reviewsRes.rows.length > 0
      ? Math.round((reviewsRes.rows.reduce((s, r) => s + Number(r.rating), 0) / reviewsRes.rows.length) * 10) / 10
      : null;

    const result: PortfolioData = {
      id:                     p.id,
      name_initial:           (p.name_initial as string).toUpperCase(),
      identity_tier:          Number(p.identity_tier),
      trust_score:            Number(p.trust_score),
      bio:                    p.bio,
      hourly_rate_cents:      Number(p.hourly_rate_cents),
      skills:                 skillsRes.rows.map(r => r.name as string),
      total_deployments:      Number(stat?.total_deployments      ?? 0),
      total_earned_cents:     Number(stat?.total_earned_cents     ?? 0),
      avg_checklist_pass_pct: Number(stat?.avg_checklist_pass_pct ?? 0),
      drift_incidents:        Number(stat?.drift_incidents        ?? 0),
      avg_rating:             avgRating,
      review_count:           reviewsRes.rows.length,
      recent_reviews: reviewsRes.rows.map(r => ({
        rating:     Number(r.rating),
        body:       r.body,
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      })),
    };

    return NextResponse.json(result);
  } finally {
    client.release();
  }
}
