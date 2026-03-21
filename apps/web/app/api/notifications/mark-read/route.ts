// POST /api/notifications/mark-read — marks a single notification as read.
// Uses a static path (not dynamic [id]) so Next.js App Router wins over the
// /api/notifications/:path* rewrite (dynamic routes lose to afterFiles rewrites).
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const userId = (session?.user as { profileId?: string })?.profileId;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id } = body;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query(
      `UPDATE in_app_notifications
          SET read_at = NOW()
        WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/notifications/mark-read]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  } finally {
    client?.release();
  }
}
