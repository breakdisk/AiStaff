export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 30_000 });

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT id, title, body, severity, starts_at, expires_at, created_at
       FROM announcements
       WHERE starts_at <= NOW()
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC
       LIMIT 5`
    );
    return NextResponse.json({ announcements: result.rows });
  } catch (err) {
    console.error("[announcements GET]", err);
    return NextResponse.json({ announcements: [] });
  }
}
