export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface EndorsementCount {
  skill_tag_id: string;
  skill_name:   string;
  count:        number;
}

// Public — no auth required
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ profileId: string }> },
): Promise<NextResponse> {
  const { profileId } = await params;

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT
         se.skill_tag_id,
         st.name AS skill_name,
         COUNT(*)::INT AS count
       FROM skill_endorsements se
       JOIN skill_tags st ON st.id = se.skill_tag_id
      WHERE se.profile_id = $1
      GROUP BY se.skill_tag_id, st.name
      ORDER BY count DESC`,
      [profileId],
    );
    return NextResponse.json(rows as EndorsementCount[]);
  } finally {
    client.release();
  }
}
