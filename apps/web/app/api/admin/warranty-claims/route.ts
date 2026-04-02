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
  const resolution = searchParams.get("resolution"); // null = ALL, "PENDING" = IS NULL
  const page   = Math.max(0, parseInt(searchParams.get("page") ?? "0"));
  const limit  = 50;
  const offset = page * limit;

  try {
    const result = await pool.query(
      `SELECT wc.id, wc.deployment_id, wc.claimant_id, wc.drift_proof,
              wc.claimed_at, wc.resolved_at, wc.resolution::TEXT AS resolution,
              d.escrow_amount_cents, d.state::TEXT AS deployment_state
       FROM warranty_claims wc
       LEFT JOIN deployments d ON d.id = wc.deployment_id
       WHERE ($1::TEXT IS NULL
              OR ($1 = 'PENDING' AND wc.resolution IS NULL)
              OR ($1 != 'PENDING' AND wc.resolution::TEXT = $1))
       ORDER BY wc.claimed_at DESC
       LIMIT $2 OFFSET $3`,
      [resolution, limit, offset]
    );
    return NextResponse.json({ claims: result.rows, page, limit });
  } catch (err) {
    console.error("[admin/warranty-claims GET]", err);
    return NextResponse.json({ error: "Failed to load claims" }, { status: 500 });
  }
}
