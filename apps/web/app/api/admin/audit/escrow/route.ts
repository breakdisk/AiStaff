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
  const from   = searchParams.get("from");
  const to     = searchParams.get("to");
  const page   = Math.max(0, parseInt(searchParams.get("page") ?? "0"));
  const limit  = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));
  const offset = page * limit;

  try {
    const result = await pool.query(
      `SELECT id, deployment_id, recipient_id, amount_cents, reason, created_at
       FROM escrow_payouts
       WHERE ($1::TIMESTAMPTZ IS NULL OR created_at >= $1::TIMESTAMPTZ)
         AND ($2::TIMESTAMPTZ IS NULL OR created_at <= $2::TIMESTAMPTZ)
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [from ?? null, to ?? null, limit, offset]
    );
    return NextResponse.json({ rows: result.rows, page, limit });
  } catch (err) {
    console.error("[admin/audit/escrow GET]", err);
    return NextResponse.json({ error: "Failed to load escrow audit" }, { status: 500 });
  }
}
