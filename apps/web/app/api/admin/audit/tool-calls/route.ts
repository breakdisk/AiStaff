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
  const decision = searchParams.get("decision"); // null=ALL, ALLOWED, DENIED
  const from   = searchParams.get("from");
  const to     = searchParams.get("to");
  const page   = Math.max(0, parseInt(searchParams.get("page") ?? "0"));
  const limit  = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));
  const offset = page * limit;

  // Actual columns (from migration 0004): id BIGSERIAL, deployment_id UUID,
  // tool_name TEXT, params TEXT, decision TEXT, called_at TIMESTAMPTZ
  try {
    const result = await pool.query(
      `SELECT id, deployment_id, tool_name, params, decision, called_at
       FROM tool_call_audit
       WHERE ($1::TEXT IS NULL OR decision = $1)
         AND ($2::TIMESTAMPTZ IS NULL OR called_at >= $2::TIMESTAMPTZ)
         AND ($3::TIMESTAMPTZ IS NULL OR called_at <= $3::TIMESTAMPTZ)
       ORDER BY called_at DESC
       LIMIT $4 OFFSET $5`,
      [decision === "ALL" ? null : decision, from ?? null, to ?? null, limit, offset]
    );
    return NextResponse.json({ rows: result.rows, page, limit });
  } catch (err) {
    console.error("[admin/audit/tool-calls GET]", err);
    return NextResponse.json({ error: "Failed to load tool call audit" }, { status: 500 });
  }
}
