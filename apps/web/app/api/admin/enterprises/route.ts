export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Pool } from "pg";
import { requireAdmin } from "@/app/api/admin/_auth";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { rows } = await pool.query(
    `SELECT
       o.id,
       o.name,
       up.email                  AS owner_email,
       o.plan_tier,
       COUNT(om.id)::INT         AS member_count,
       o.contract_value_cents,
       o.renewal_date,
       o.is_verified,
       o.verified_at,
       o.created_at
     FROM organisations o
     JOIN unified_profiles up ON up.id = o.owner_id
LEFT JOIN org_members om      ON om.org_id = o.id
    GROUP BY o.id, up.email
    ORDER BY o.created_at DESC`,
  );

  return NextResponse.json(rows);
}
