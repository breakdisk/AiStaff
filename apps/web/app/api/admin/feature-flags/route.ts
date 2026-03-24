export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";
import { assertAdmin } from "@/lib/admin";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 30_000 });
const FLAG_NAME_RE = /^[a-z][a-z0-9_]*$/;

export async function GET() {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertAdmin(profileId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await pool.query(
      `SELECT name, enabled, description, updated_at, updated_by
       FROM feature_flags ORDER BY name ASC`
    );
    return NextResponse.json({ flags: result.rows });
  } catch (err) {
    console.error("[admin/feature-flags GET]", err);
    return NextResponse.json({ error: "Failed to load flags" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertAdmin(profileId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { name?: string; description?: string; enabled?: boolean };
  if (!body.name || !FLAG_NAME_RE.test(body.name)) {
    return NextResponse.json({ error: "name must match ^[a-z][a-z0-9_]*$" }, { status: 400 });
  }

  try {
    await pool.query(
      `INSERT INTO feature_flags (name, enabled, description, updated_by)
       VALUES ($1, $2, $3, $4)`,
      [body.name, body.enabled ?? false, body.description ?? "", profileId]
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("duplicate key")) {
      return NextResponse.json({ error: "Flag name already exists" }, { status: 409 });
    }
    console.error("[admin/feature-flags POST]", err);
    return NextResponse.json({ error: "Failed to create flag" }, { status: 500 });
  }
}
