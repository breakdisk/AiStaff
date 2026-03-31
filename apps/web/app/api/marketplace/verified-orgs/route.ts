export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Returns the set of org IDs that have been admin-verified. Public — no auth needed. */
export async function GET() {
  const { rows } = await pool.query(
    `SELECT id FROM organisations WHERE is_verified = true`,
  );
  return NextResponse.json({ verified: rows.map((r: { id: string }) => r.id) });
}
