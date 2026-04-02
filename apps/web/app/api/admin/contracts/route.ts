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
  const status       = searchParams.get("status");
  const contractType = searchParams.get("contract_type");
  const page   = Math.max(0, parseInt(searchParams.get("page") ?? "0"));
  const limit  = 50;
  const offset = page * limit;

  try {
    // party_b_email is a TEXT column on contracts (migration 0037); join unified_profiles for party_a only.
    const result = await pool.query(
      `SELECT c.id,
              c.contract_type,
              c.status::TEXT                AS status,
              c.document_hash,
              c.created_at,
              c.signed_at,
              c.party_b_signed_at,
              c.party_a,
              c.party_b,
              c.deployment_id,
              pa.email                      AS party_a_email,
              c.party_b_email,
              LEFT(c.document_text, 200)    AS document_preview
       FROM contracts c
       LEFT JOIN unified_profiles pa ON pa.id = c.party_a
       WHERE ($1::TEXT IS NULL OR c.status::TEXT = $1)
         AND ($2::TEXT IS NULL OR c.contract_type ILIKE '%' || $2 || '%')
       ORDER BY c.created_at DESC
       LIMIT $3 OFFSET $4`,
      [status, contractType, limit, offset]
    );
    return NextResponse.json({ contracts: result.rows, page, limit });
  } catch (err) {
    console.error("[admin/contracts GET]", err);
    return NextResponse.json({ error: "Failed to load contracts" }, { status: 500 });
  }
}
