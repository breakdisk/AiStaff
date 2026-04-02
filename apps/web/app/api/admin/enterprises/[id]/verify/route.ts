import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { requireAdmin } from "@/app/api/admin/_auth";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;

  const { rows } = await pool.query(
    `UPDATE organisations
        SET is_verified = NOT is_verified,
            verified_at = CASE WHEN NOT is_verified THEN NOW() ELSE NULL END
      WHERE id = $1
      RETURNING id, name, is_verified, verified_at`,
    [id],
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}
