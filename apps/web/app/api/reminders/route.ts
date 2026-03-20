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

  let body: { title?: string; date?: string; hours?: number; minutes?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, date, hours, minutes } = body;

  if (!title || typeof title !== "string" || title.trim() === "") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (typeof hours !== "number" || hours < 0 || hours > 23) {
    return NextResponse.json({ error: "hours must be 0–23" }, { status: 400 });
  }
  if (typeof minutes !== "number" || minutes < 0 || minutes > 59) {
    return NextResponse.json({ error: "minutes must be 0–59" }, { status: 400 });
  }

  // Combine date + time into a UTC timestamp string.
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const remindAt = `${date}T${hh}:${mm}:00Z`;

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `INSERT INTO reminders (user_id, title, remind_at, source)
       VALUES ($1, $2, $3, 'user')
       RETURNING id, user_id, deployment_id, title, remind_at, source, fired, created_at`,
      [userId, title.trim(), remindAt],
    );
    return NextResponse.json({ reminder: result.rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/reminders]", err);
    return NextResponse.json({ error: "Failed to create reminder" }, { status: 500 });
  } finally {
    client?.release();
  }
}
