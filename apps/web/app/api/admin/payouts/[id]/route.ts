export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";
import { assertAdmin } from "@/lib/admin";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 30_000 });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertAdmin(profileId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const [depRes, payoutsRes, feesRes] = await Promise.all([
      pool.query(`SELECT id, state::TEXT AS state, escrow_amount_cents, client_id, freelancer_id,
                created_at, updated_at,
                updated_at < NOW() - INTERVAL '48 hours' AS is_stuck
         FROM deployments WHERE id = $1`, [id]),
      pool.query(`SELECT id, recipient_id, amount_cents, reason, created_at
         FROM escrow_payouts WHERE deployment_id = $1 ORDER BY created_at ASC`, [id]),
      pool.query(`SELECT id, fee_cents, fee_pct, created_at
         FROM platform_fees WHERE deployment_id = $1 ORDER BY created_at ASC`, [id]),
    ]);
    if (!depRes.rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      deployment: depRes.rows[0],
      escrow_payouts: payoutsRes.rows,
      platform_fees: feesRes.rows,
    });
  } catch (err) {
    console.error("[admin/payouts/[id] GET]", err);
    return NextResponse.json({ error: "Failed to load deployment" }, { status: 500 });
  }
}
