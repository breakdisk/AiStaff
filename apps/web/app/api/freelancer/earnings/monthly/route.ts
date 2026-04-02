export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface MonthlyRow {
  month:         string; // YYYY-MM
  earned_cents:  number;
  payout_count:  number;
}

export interface MonthlyEarningsResponse {
  monthly:                 MonthlyRow[];
  total_hours:             number;
  effective_hourly_cents:  number | null;
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await pool.connect();
  try {
    const [monthlyRes, hoursRes] = await Promise.all([
      client.query(
        `SELECT
           TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
           SUM(amount_cents)::BIGINT                           AS earned_cents,
           COUNT(*)::INT                                       AS payout_count
         FROM escrow_payouts
        WHERE recipient_id = $1
          AND created_at  >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY DATE_TRUNC('month', created_at)`,
        [profileId],
      ),

      client.query(
        `SELECT
           COALESCE(
             SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) / 3600),
             0
           ) AS total_hours
         FROM work_diary_sessions
        WHERE owner_profile_id = $1
          AND ended_at IS NOT NULL`,
        [profileId],
      ),
    ]);

    const monthly: MonthlyRow[] = monthlyRes.rows.map(r => ({
      month:        r.month,
      earned_cents: Number(r.earned_cents),
      payout_count: Number(r.payout_count),
    }));

    const totalHours = Math.round(Number(hoursRes.rows[0]?.total_hours ?? 0));
    const totalEarned = monthly.reduce((s, r) => s + r.earned_cents, 0);
    const effectiveHourlyCents = totalHours > 0 ? Math.round(totalEarned / totalHours) : null;

    return NextResponse.json({
      monthly,
      total_hours:            totalHours,
      effective_hourly_cents: effectiveHourlyCents,
    } satisfies MonthlyEarningsResponse);
  } finally {
    client.release();
  }
}
