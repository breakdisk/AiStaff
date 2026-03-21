// apps/web/app/api/reminders/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT id, user_id, deployment_id, title,
              remind_at, source, fired, created_at
       FROM reminders
       WHERE user_id = $1
       ORDER BY remind_at ASC
       LIMIT 100`,
      [userId],
    );
    return NextResponse.json({ reminders: result.rows });
  } catch (err) {
    console.error("[GET /api/reminders]", err);
    return NextResponse.json({ reminders: [] }, { status: 500 });
  } finally {
    client?.release();
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const userId = (session?.user as { profileId?: string })?.profileId;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { title?: string; remind_at?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, remind_at } = body;

  if (!title || typeof title !== "string" || title.trim() === "") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!remind_at || typeof remind_at !== "string") {
    return NextResponse.json({ error: "remind_at is required" }, { status: 400 });
  }
  const remindAt = new Date(remind_at);
  if (isNaN(remindAt.getTime())) {
    return NextResponse.json({ error: "remind_at must be a valid ISO datetime" }, { status: 400 });
  }

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `INSERT INTO reminders (user_id, title, remind_at, source)
       VALUES ($1, $2, $3, 'user')
       RETURNING id, user_id, deployment_id, title, remind_at, source, fired, created_at`,
      [userId, title.trim(), remindAt.toISOString()],
    );
    return NextResponse.json({ reminder: result.rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/reminders]", err);
    return NextResponse.json({ error: "Failed to create reminder" }, { status: 500 });
  } finally {
    client?.release();
  }
}
