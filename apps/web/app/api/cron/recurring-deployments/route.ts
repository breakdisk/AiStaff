export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { sendEmail } from "@/lib/mailer";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const RECURRENCE_DAYS: Record<string, number> = {
  MONTHLY:   30,
  QUARTERLY: 91,
  ANNUAL:    365,
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    // Find all due recurring deployments
    const { rows: due } = await client.query(
      `SELECT d.id, d.agent_id, d.client_id, d.developer_id, d.freelancer_id,
              d.agent_artifact_hash, d.escrow_amount_cents, d.recurrence,
              d.org_id, d.agency_id, d.agency_pct,
              al.name AS listing_name,
              p.email AS client_email, p.full_name AS client_name
         FROM deployments d
         JOIN agent_listings al ON al.id = d.agent_id
         JOIN unified_profiles p ON p.id = d.client_id
        WHERE d.recurrence IS NOT NULL
          AND d.next_billing_at <= NOW()
          AND d.state = 'RELEASED'`,
    );

    const created: string[] = [];

    for (const dep of due) {
      const days = RECURRENCE_DAYS[dep.recurrence] ?? 30;
      const nextBilling = new Date(Date.now() + days * 86_400_000).toISOString();

      // Clone deployment
      const { rows: newDep } = await client.query(
        `INSERT INTO deployments
           (agent_id, client_id, developer_id, freelancer_id, agent_artifact_hash,
            escrow_amount_cents, state, recurrence, recurrence_parent_id,
            next_billing_at, org_id, agency_id, agency_pct)
         VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [
          dep.agent_id, dep.client_id, dep.developer_id, dep.freelancer_id,
          dep.agent_artifact_hash, dep.escrow_amount_cents,
          dep.recurrence, dep.id, nextBilling,
          dep.org_id ?? null, dep.agency_id ?? null, dep.agency_pct ?? 0,
        ],
      );
      created.push(newDep[0].id);

      // Clear next_billing_at on the parent so it doesn't fire again
      await client.query(
        `UPDATE deployments SET next_billing_at = NULL WHERE id = $1`,
        [dep.id],
      );

      // Notify client
      if (dep.client_email) {
        const name = dep.client_name ?? "there";
        await sendEmail(
          dep.client_email,
          `Your retainer for "${dep.listing_name}" has renewed`,
          `Hi ${name},\n\nYour ${dep.recurrence.toLowerCase()} retainer for "${dep.listing_name}" ` +
          `has automatically renewed.\n\n` +
          `Amount: $${(Number(dep.escrow_amount_cents) / 100).toFixed(2)}\n\n` +
          `View your deployment at:\nhttps://aistaffglobal.com/dashboard\n\n` +
          `To cancel future renewals, contact your account manager or visit your dashboard.`,
        );
      }
    }

    return NextResponse.json({ renewed: created.length, deployment_ids: created });
  } finally {
    client.release();
  }
}
