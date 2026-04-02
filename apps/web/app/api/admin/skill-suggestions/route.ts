export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";
import { assertAdmin } from "@/lib/admin";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

export async function GET() {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await assertAdmin(profileId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT ss.id, ss.tag, ss.domain, ss.status, ss.created_at, ss.reviewed_at,
              up.email AS suggested_by_email
       FROM skill_suggestions ss
       JOIN unified_profiles up ON up.id = ss.suggested_by
       WHERE ss.status = 'pending'
       ORDER BY ss.created_at ASC`,
    );
    return NextResponse.json({ suggestions: result.rows });
  } catch (err) {
    console.error("[admin/skill-suggestions GET]", err);
    return NextResponse.json({ error: "Failed to load suggestions" }, { status: 500 });
  } finally {
    client?.release();
  }
}
