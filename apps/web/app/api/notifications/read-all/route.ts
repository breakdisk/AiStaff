// POST /api/notifications/read-all — marks all unread in-app notifications as read.
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

export async function POST(): Promise<NextResponse> {
  const session = await auth();
  const userId = (session?.user as { profileId?: string })?.profileId;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `UPDATE in_app_notifications
          SET read_at = NOW()
        WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    return NextResponse.json({ ok: true, updated: result.rowCount });
  } catch (err) {
    console.error("[POST /api/notifications/read-all]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  } finally {
    client?.release();
  }
}
