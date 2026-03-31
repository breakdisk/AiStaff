export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface ApplicationRow {
  id:               string;
  job_title:        string;
  proposed_budget:  string;
  proposed_timeline: string;
  status:           string;
  submitted_at:     string;
  job_listing_id:   string | null;
  listing_name:     string | null;
  client_email:     string | null;
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await pool.connect();
  try {
    const { rows } = await client.query<ApplicationRow>(
      `SELECT
         p.id,
         p.job_title,
         p.proposed_budget,
         p.proposed_timeline,
         p.status,
         p.submitted_at,
         p.job_listing_id,
         al.name   AS listing_name,
         up.email  AS client_email
       FROM proposals p
       LEFT JOIN agent_listings   al ON al.id   = p.job_listing_id
       LEFT JOIN unified_profiles up ON up.id   = al.developer_id
       WHERE p.freelancer_id = $1
          OR p.freelancer_email = (SELECT email FROM unified_profiles WHERE id = $1 LIMIT 1)
       ORDER BY p.submitted_at DESC`,
      [profileId],
    );
    return NextResponse.json(rows);
  } finally {
    client.release();
  }
}
