export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface BalanceRow {
  id:            string;
  deployment_id: string;
  amount_cents:  number;
  reason:        string;
  created_at:    string;
}

export interface BalanceResponse {
  total_earned_cents: number;
  last_30d_cents:     number;
  rows:               BalanceRow[];
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query<{
      id:            string;
      deployment_id: string;
      amount_cents:  string;
      reason:        string;
      created_at:    Date;
    }>(
      `SELECT id, deployment_id, amount_cents, reason, created_at
         FROM escrow_payouts
        WHERE recipient_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [profileId],
    );

    const payouts: BalanceRow[] = rows.map(r => ({
      id:            r.id,
      deployment_id: r.deployment_id,
      amount_cents:  Number(r.amount_cents),
      reason:        r.reason,
      created_at:    r.created_at.toISOString(),
    }));

    const now = Date.now();
    const ms30d = 30 * 24 * 60 * 60 * 1000;

    const total_earned_cents = payouts.reduce((s, p) => s + p.amount_cents, 0);
    const last_30d_cents = payouts
      .filter(p => now - new Date(p.created_at).getTime() <= ms30d)
      .reduce((s, p) => s + p.amount_cents, 0);

    return NextResponse.json({ total_earned_cents, last_30d_cents, rows: payouts });
  } finally {
    client.release();
  }
}
