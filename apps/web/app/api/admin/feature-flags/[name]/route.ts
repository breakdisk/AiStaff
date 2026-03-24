export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";
import { assertAdmin } from "@/lib/admin";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 30_000 });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertAdmin(profileId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { enabled?: boolean; description?: string };

  try {
    const result = await pool.query(
      `UPDATE feature_flags
       SET enabled     = COALESCE($2, enabled),
           description = COALESCE($3, description),
           updated_at  = NOW(),
           updated_by  = $4
       WHERE name = $1
       RETURNING name, enabled, description, updated_at`,
      [name, body.enabled ?? null, body.description ?? null, profileId]
    );
    if (!result.rows.length) return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    return NextResponse.json(result.rows[0]);
  } catch (err) {
    console.error("[admin/feature-flags/[name] PATCH]", err);
    return NextResponse.json({ error: "Failed to update flag" }, { status: 500 });
  }
}
