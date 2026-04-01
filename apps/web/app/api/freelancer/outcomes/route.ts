export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface OutcomeStats {
  total_deployments:      number;
  total_earned_cents:     number;
  avg_checklist_pass_pct: number;
  drift_incidents:        number;
  avg_rating:             number | null;
  review_count:           number;
}

export interface OutcomeDeployment {
  id:           string;
  job_title:    string;
  created_at:   string;
  escrow_cents: number;
  steps_passed: number;
  steps_total:  number;
}

export interface OutcomesResponse {
  stats:       OutcomeStats;
  deployments: OutcomeDeployment[];
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await pool.connect();
  try {
    const [statsRes, deploymentsRes, ratingRes] = await Promise.all([
      // ROI stats from the materialized view
      client.query(
        `SELECT
           total_deployments,
           total_earned_cents,
           avg_checklist_pass_pct,
           drift_incidents
         FROM talent_roi
        WHERE talent_id = $1`,
        [profileId],
      ),

      // Last 6 completed deployments as case studies
      client.query(
        `SELECT
           d.id,
           COALESCE(al.name, 'Untitled Project') AS job_title,
           d.created_at,
           COALESCE(ep.amount_cents, 0)          AS escrow_cents,
           COUNT(cs.id) FILTER (WHERE cs.completed_at IS NOT NULL)::INT AS steps_passed,
           COUNT(cs.id)::INT                     AS steps_total
         FROM deployments d
         LEFT JOIN agent_listings    al ON al.id = d.agent_id
         LEFT JOIN escrow_payouts    ep ON ep.deployment_id = d.id
                                       AND ep.recipient_id  = $1
         LEFT JOIN dod_checklist_steps cs ON cs.deployment_id = d.id
        WHERE d.freelancer_id = $1
          AND d.state = 'COMPLETED'
        GROUP BY d.id, al.name, d.created_at, ep.amount_cents
        ORDER BY d.created_at DESC
        LIMIT 6`,
        [profileId],
      ),

      // Average star rating from client reviews
      client.query(
        `SELECT
           ROUND(AVG(dr.rating)::NUMERIC, 1) AS avg_rating,
           COUNT(*)::INT                     AS review_count
         FROM deployment_reviews dr
         JOIN deployments dep ON dep.id = dr.deployment_id
        WHERE dep.freelancer_id = $1
          AND dr.reviewer_id   != $1`,
        [profileId],
      ),
    ]);

    const raw = statsRes.rows[0];
    const stats: OutcomeStats = {
      total_deployments:      Number(raw?.total_deployments      ?? 0),
      total_earned_cents:     Number(raw?.total_earned_cents     ?? 0),
      avg_checklist_pass_pct: Number(raw?.avg_checklist_pass_pct ?? 0),
      drift_incidents:        Number(raw?.drift_incidents        ?? 0),
      avg_rating:             ratingRes.rows[0]?.avg_rating ? Number(ratingRes.rows[0].avg_rating) : null,
      review_count:           Number(ratingRes.rows[0]?.review_count ?? 0),
    };

    const deployments: OutcomeDeployment[] = deploymentsRes.rows.map(r => ({
      id:           r.id,
      job_title:    r.job_title,
      created_at:   r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      escrow_cents: Number(r.escrow_cents),
      steps_passed: Number(r.steps_passed),
      steps_total:  Number(r.steps_total),
    }));

    return NextResponse.json({ stats, deployments } satisfies OutcomesResponse);
  } finally {
    client.release();
  }
}
