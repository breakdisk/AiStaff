export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface TopTalent {
  id:                  string;
  email_initial:       string;
  identity_tier:       number;
  trust_score:         number;
  rate_cents:          number;
  total_deployments:   number;
  total_earned_cents:  number;
  checklist_pct:       number;
  drift_incidents:     number;
  avg_rating:          number;
  review_count:        number;
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT
         up.id,
         up.email,
         COALESCE(up.identity_tier,     0)  AS identity_tier,
         COALESCE(up.trust_score,       0)  AS trust_score,
         COALESCE(up.hourly_rate_cents, 0)  AS rate_cents,
         tr.total_deployments,
         tr.total_earned_cents,
         ROUND((tr.avg_checklist_pass_pct * 100)::NUMERIC, 0) AS checklist_pct,
         tr.drift_incidents,
         COALESCE(ROUND(AVG(dr.rating)::NUMERIC, 1), 0)       AS avg_rating,
         COUNT(dr.id)::INT                                     AS review_count
       FROM talent_roi tr
       JOIN unified_profiles up  ON up.id = tr.talent_id
       LEFT JOIN deployments dep ON dep.freelancer_id = up.id
       LEFT JOIN deployment_reviews dr ON dr.deployment_id = dep.id
      WHERE tr.total_deployments > 0
      GROUP BY
         up.id, up.email, up.identity_tier, up.trust_score, up.hourly_rate_cents,
         tr.total_deployments, tr.total_earned_cents,
         tr.avg_checklist_pass_pct, tr.drift_incidents
      ORDER BY tr.avg_checklist_pass_pct DESC, tr.total_earned_cents DESC
      LIMIT 20`,
    );

    const result: TopTalent[] = rows.map(r => ({
      id:                 r.id,
      email_initial:      r.email ? (r.email as string).charAt(0).toUpperCase() : '?',
      identity_tier:      Number(r.identity_tier),
      trust_score:        Number(r.trust_score),
      rate_cents:         Number(r.rate_cents),
      total_deployments:  Number(r.total_deployments),
      total_earned_cents: Number(r.total_earned_cents),
      checklist_pct:      Number(r.checklist_pct),
      drift_incidents:    Number(r.drift_incidents),
      avg_rating:         Number(r.avg_rating),
      review_count:       Number(r.review_count),
    }));

    return NextResponse.json(result);
  } finally {
    client.release();
  }
}
