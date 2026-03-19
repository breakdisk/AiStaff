export const runtime = "nodejs";

// Serves skill_tags directly from the DB — no marketplace_service dependency.
// Tags are seeded in migration 0017 (16 tags across 5 domains).

import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

export async function GET() {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT id, tag, domain FROM skill_tags ORDER BY domain, tag`,
    );
    return NextResponse.json({ skill_tags: result.rows });
  } catch (err) {
    console.error("[api/skill-tags]", err);
    return NextResponse.json({ skill_tags: [] }, { status: 500 });
  } finally {
    client?.release();
  }
}
