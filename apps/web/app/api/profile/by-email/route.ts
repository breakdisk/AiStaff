export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email param required" }, { status: 400 });

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id AS profile_id, full_name, email FROM unified_profiles WHERE email = $1 LIMIT 1`,
      [email.toLowerCase()],
    );
    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } finally {
    client.release();
  }
}
