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
  const state  = searchParams.get("state");
  const from   = searchParams.get("from");
  const to     = searchParams.get("to");
  const page   = Math.max(0, parseInt(searchParams.get("page") ?? "0"));
  const limit  = 50;
  const offset = page * limit;

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT d.id, d.state::TEXT AS state, d.escrow_amount_cents,
              d.client_id, d.freelancer_id, d.created_at, d.updated_at,
              EXTRACT(EPOCH FROM (NOW() - d.updated_at))::INT AS seconds_in_state,
              COALESCE(pf.fee_cents, 0) AS platform_fee_cents
       FROM deployments d
       LEFT JOIN platform_fees pf ON pf.deployment_id = d.id
       WHERE ($1::TEXT IS NULL OR d.state::TEXT = $1)
         AND ($2::TIMESTAMPTZ IS NULL OR d.created_at >= $2::TIMESTAMPTZ)
         AND ($3::TIMESTAMPTZ IS NULL OR d.created_at <= $3::TIMESTAMPTZ)
       ORDER BY d.created_at DESC
       LIMIT $4 OFFSET $5`,
      [state, from ?? null, to ?? null, limit, offset]
    );
    return NextResponse.json({ deployments: result.rows, page, limit });
  } catch (err) {
    console.error("[admin/payouts GET]", err);
    return NextResponse.json({ error: "Failed to load payouts" }, { status: 500 });
  } finally {
    client?.release();
  }
}
