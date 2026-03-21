// PATCH /api/notifications/[id]/read — marks a single notification as read.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth();
  const userId = (session?.user as { profileId?: string })?.profileId;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

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
    console.error("[PATCH /api/notifications/[id]/read]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  } finally {
    client?.release();
  }
}
