export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";
import { assertAdmin } from "@/lib/admin";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 30_000 });

export async function GET(req: Request) {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertAdmin(profileId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const eventType = searchParams.get("event_type");
  const page   = Math.max(0, parseInt(searchParams.get("page") ?? "0"));
  const limit  = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));
  const offset = page * limit;

  // Columns from migration 0018: id, profile_id, event_type, event_data,
  // old_tier, new_tier, old_score, new_score, actor_id, created_at
  try {
    const result = await pool.query(
      `SELECT id, profile_id, event_type, old_tier, new_tier,
              old_score, new_score, actor_id, created_at
       FROM identity_audit_log
       WHERE ($1::TEXT IS NULL OR event_type ILIKE '%' || $1 || '%')
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [eventType, limit, offset]
    );
    return NextResponse.json({ rows: result.rows, page, limit });
  } catch (err) {
    console.error("[admin/audit/identity GET]", err);
    return NextResponse.json({ error: "Failed to load identity audit" }, { status: 500 });
  }
}
