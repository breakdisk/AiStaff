export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";
import { assertAdmin } from "@/lib/admin";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 30_000 });

export async function GET() {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertAdmin(profileId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await pool.query(
      `SELECT id, title, body, severity, starts_at, expires_at, created_by, created_at,
              (starts_at <= NOW() AND (expires_at IS NULL OR expires_at > NOW())) AS is_active
       FROM announcements ORDER BY created_at DESC`
    );
    return NextResponse.json({ announcements: result.rows });
  } catch (err) {
    console.error("[admin/announcements GET]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertAdmin(profileId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    title?: string; body?: string;
    severity?: string; expires_at?: string;
  };
  if (!body.title?.trim() || !body.body?.trim()) {
    return NextResponse.json({ error: "title and body are required" }, { status: 400 });
  }
  const validSeverity = ["info", "warning", "urgent"];
  if (body.severity && !validSeverity.includes(body.severity)) {
    return NextResponse.json({ error: "severity must be info | warning | urgent" }, { status: 400 });
  }

  try {
    const result = await pool.query(
      `INSERT INTO announcements (title, body, severity, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, body, severity, starts_at, expires_at, created_at`,
      [body.title, body.body, body.severity ?? "info", body.expires_at ?? null, profileId]
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (err) {
    console.error("[admin/announcements POST]", err);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}
