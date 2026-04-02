// GET /api/notifications — lists in-app notifications for the session user.
// Bypasses notification_service rewrite; queries in_app_notifications directly
// with correct column names (handlers.rs uses wrong schema — title/event_type/priority/read_at).
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const userId = (session?.user as { profileId?: string })?.profileId;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const unreadOnly = req.nextUrl.searchParams.get("unread") === "true";

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT id, user_id, title, body, event_type, priority,
              read_at, created_at
         FROM in_app_notifications
        WHERE user_id = $1
          ${unreadOnly ? "AND read_at IS NULL" : ""}
        ORDER BY created_at DESC
        LIMIT 100`,
      [userId],
    );
    return NextResponse.json(result.rows);
  } catch (err) {
    console.error("[GET /api/notifications]", err);
    return NextResponse.json([], { status: 500 });
  } finally {
    client?.release();
  }
}
