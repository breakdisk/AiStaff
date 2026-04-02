export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET() {
  const session = await auth();
  const profileId = session?.user?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await pool.query(
    `SELECT
       wc.id,
       wc.deployment_id,
       wc.drift_proof,
       wc.claimed_at,
       wc.resolved_at,
       wc.resolution::TEXT AS resolution,
       al.name AS listing_name
     FROM warranty_claims wc
     JOIN deployments d    ON d.id  = wc.deployment_id
     JOIN agent_listings al ON al.id = d.agent_id
    WHERE wc.claimant_id = $1
    ORDER BY wc.claimed_at DESC`,
    [profileId],
  );

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const profileId = session?.user?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { deployment_id: string; description: string };
  if (!body.deployment_id || !body.description?.trim()) {
    return NextResponse.json({ error: "deployment_id and description required" }, { status: 400 });
  }

  await pool.query(
    `INSERT INTO warranty_claims (deployment_id, claimant_id, drift_proof)
     VALUES ($1, $2, $3)`,
    [body.deployment_id, profileId, body.description.trim()],
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}
