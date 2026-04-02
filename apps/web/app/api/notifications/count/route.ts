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
  const userId = (session?.user as { profileId?: string })?.profileId;
  if (!userId) {
    return NextResponse.json({ count: 0 });
  }

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT COUNT(*)::int AS count
         FROM in_app_notifications
        WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    return NextResponse.json({ count: result.rows[0]?.count ?? 0 });
  } catch {
    return NextResponse.json({ count: 0 });
  } finally {
    client?.release();
  }
}
