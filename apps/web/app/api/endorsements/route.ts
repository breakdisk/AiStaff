export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// POST — endorse skills for a freelancer after a completed deployment
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const endorserId = (session?.user as { profileId?: string })?.profileId;
  if (!endorserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    profile_id:    string;
    deployment_id: string;
    skill_tag_ids: string[];
  };
  const { profile_id, deployment_id, skill_tag_ids } = body;

  if (!profile_id || !deployment_id || !Array.isArray(skill_tag_ids) || skill_tag_ids.length === 0) {
    return NextResponse.json({ error: "profile_id, deployment_id, skill_tag_ids required" }, { status: 400 });
  }
  if (skill_tag_ids.length > 10) {
    return NextResponse.json({ error: "Max 10 skills per endorsement" }, { status: 400 });
  }
  if (endorserId === profile_id) {
    return NextResponse.json({ error: "Cannot endorse yourself" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    // Verify the deployment exists and the endorser was the client/developer
    const { rows: deps } = await client.query(
      `SELECT id FROM deployments
        WHERE id = $1
          AND (developer_id = $2 OR client_id = $2)
          AND state = 'COMPLETED'`,
      [deployment_id, endorserId],
    );
    if (deps.length === 0) {
      return NextResponse.json(
        { error: "Deployment not found or not yet completed" },
        { status: 404 },
      );
    }

    let inserted = 0;
    for (const skillTagId of skill_tag_ids) {
      const { rowCount } = await client.query(
        `INSERT INTO skill_endorsements (endorser_id, profile_id, skill_tag_id, deployment_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [endorserId, profile_id, skillTagId, deployment_id],
      );
      inserted += rowCount ?? 0;
    }

    return NextResponse.json({ inserted }, { status: 201 });
  } finally {
    client.release();
  }
}
