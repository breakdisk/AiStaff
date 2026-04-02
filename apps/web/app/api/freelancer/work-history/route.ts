export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface WorkHistoryRow {
  deployment_id:       string;
  job_title:           string;
  category:            string | null;
  escrow_amount_cents: number;
  state:               string;
  created_at:          string;
  updated_at:          string;
  client_masked:       string | null;
  milestones_total:    number;
  milestones_approved: number;
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await pool.connect();
  try {
    const { rows } = await client.query<WorkHistoryRow>(
      `SELECT
         d.id              AS deployment_id,
         al.name           AS job_title,
         al.category,
         d.escrow_amount_cents,
         d.state,
         d.created_at,
         d.updated_at,
         SUBSTRING(cp.email, 1, 3) || '@...'  AS client_masked,
         COALESCE(ms.total,    0)::INT AS milestones_total,
         COALESCE(ms.approved, 0)::INT AS milestones_approved
       FROM deployments d
       JOIN agent_listings   al ON al.id = d.agent_id
       JOIN unified_profiles cp ON cp.id = d.client_id
       LEFT JOIN (
         SELECT deployment_id,
                COUNT(*)                           AS total,
                COUNT(*) FILTER (WHERE approved_at IS NOT NULL) AS approved
           FROM dod_checklist_steps
          GROUP BY deployment_id
       ) ms ON ms.deployment_id = d.id
      WHERE d.freelancer_id = $1
      ORDER BY d.updated_at DESC
      LIMIT 100`,
      [profileId],
    );
    return NextResponse.json(rows);
  } finally {
    client.release();
  }
}
