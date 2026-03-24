export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";
import { assertAdmin } from "@/lib/admin";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 30_000 });

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertAdmin(profileId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await pool.query(
      `DELETE FROM announcements WHERE id = $1 RETURNING id`,
      [id]
    );
    if (!result.rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[admin/announcements/[id] DELETE]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
