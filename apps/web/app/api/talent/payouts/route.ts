export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  const recipientId = (session?.user as { profileId?: string })?.profileId;
  if (!recipientId) {
    return NextResponse.json([], { status: 401 });
  }

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT ep.id,
              ep.created_at                        AS released_at,
              ep.amount_cents,
              COALESCE(al.name, 'Deleted Listing') AS agent_name,
              'RELEASED'                           AS status
         FROM escrow_payouts  ep
         JOIN deployments     d  ON d.id  = ep.deployment_id
         LEFT JOIN agent_listings al ON al.id = d.agent_id
        WHERE ep.recipient_id = $1
        ORDER BY ep.created_at DESC
        LIMIT 3`,
      [recipientId],
    );
    return NextResponse.json(result.rows);
  } catch (err) {
    console.error("[GET /api/talent/payouts]", err);
    return NextResponse.json([]);
  } finally {
    client?.release();
  }
}
