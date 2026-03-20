// apps/web/app/api/reminders/[id]/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

export async function DELETE(
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
    // user_id filter ensures cross-user deletion is structurally impossible.
    const result = await client.query(
      `DELETE FROM reminders WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[DELETE /api/reminders/[id]]", err);
    return NextResponse.json({ error: "Failed to delete reminder" }, { status: 500 });
  } finally {
    client?.release();
  }
}
