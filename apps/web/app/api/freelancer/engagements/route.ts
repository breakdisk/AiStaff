export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Returns active deployments where caller is freelancer OR client.
// Joins agent_listings for job title, unified_profiles for counterparty email.
export async function GET() {
  const session = await auth();
  const profileId = session?.user?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await pool.query(
    `SELECT
       d.id              AS deployment_id,
       al.name           AS job_title,
       CASE
         WHEN d.freelancer_id = $1 THEN cp.email
         ELSE fp.email
       END               AS counterparty_email,
       d.state,
       d.escrow_amount_cents,
       d.created_at,
       CASE WHEN d.freelancer_id = $1 THEN 'talent' ELSE 'client' END AS my_role
     FROM deployments d
     JOIN agent_listings   al ON al.id = d.agent_id
     JOIN unified_profiles cp ON cp.id = d.client_id
     JOIN unified_profiles fp ON fp.id = d.freelancer_id
    WHERE (d.freelancer_id = $1 OR d.client_id = $1)
      AND d.state NOT IN ('VETOED', 'COMPLETED', 'FAILED')
    ORDER BY d.created_at DESC
    LIMIT 50`,
    [profileId],
  );

  return NextResponse.json(rows);
}
