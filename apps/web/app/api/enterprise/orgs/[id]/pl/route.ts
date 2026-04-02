export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface PlMonth {
  month: string;           // "2026-03"
  agency_revenue_cents: number;
  subcontractor_costs_cents: number;
  net_margin_cents: number;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: orgId } = await params;
  const profileId = (session.user as { profileId?: string })?.profileId;

  // Verify caller is an org member
  const { rows: membership } = await pool.query(
    `SELECT 1 FROM org_members WHERE org_id = $1 AND profile_id = $2 LIMIT 1`,
    [orgId, profileId],
  );
  if (membership.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Agency revenue — management fees earned (last 12 months)
  const { rows: revRows } = await pool.query(
    `SELECT TO_CHAR(DATE_TRUNC('month', ep.created_at), 'YYYY-MM') AS month,
            SUM(ep.amount_cents)::BIGINT                             AS agency_revenue_cents
       FROM escrow_payouts ep
       JOIN deployments d ON d.id = ep.deployment_id
      WHERE ep.reason = 'agency_mgmt_fee'
        AND d.org_id  = $1
        AND ep.created_at >= NOW() - INTERVAL '12 months'
      GROUP BY 1
      ORDER BY 1 DESC`,
    [orgId],
  );

  // Subcontractor costs — PAID tasks (last 12 months)
  const { rows: costRows } = await pool.query(
    `SELECT TO_CHAR(DATE_TRUNC('month', updated_at), 'YYYY-MM') AS month,
            SUM(budget_cents)::BIGINT                            AS subcontractor_costs_cents
       FROM subcontract_tasks
      WHERE org_id   = $1
        AND status   = 'PAID'
        AND updated_at >= NOW() - INTERVAL '12 months'
      GROUP BY 1
      ORDER BY 1 DESC`,
    [orgId],
  );

  // Merge into a single month map
  const map: Record<string, { rev: number; cost: number }> = {};
  for (const r of revRows) {
    const m = r.month as string;
    if (!map[m]) map[m] = { rev: 0, cost: 0 };
    map[m].rev = Number(r.agency_revenue_cents);
  }
  for (const c of costRows) {
    const m = c.month as string;
    if (!map[m]) map[m] = { rev: 0, cost: 0 };
    map[m].cost = Number(c.subcontractor_costs_cents);
  }

  const months: PlMonth[] = Object.entries(map)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, { rev, cost }]) => ({
      month,
      agency_revenue_cents:      rev,
      subcontractor_costs_cents: cost,
      net_margin_cents:          rev - cost,
    }));

  // Totals
  const totals = months.reduce(
    (acc, m) => ({
      agency_revenue_cents:      acc.agency_revenue_cents      + m.agency_revenue_cents,
      subcontractor_costs_cents: acc.subcontractor_costs_cents + m.subcontractor_costs_cents,
      net_margin_cents:          acc.net_margin_cents          + m.net_margin_cents,
    }),
    { agency_revenue_cents: 0, subcontractor_costs_cents: 0, net_margin_cents: 0 },
  );

  return NextResponse.json({ months, totals });
}
