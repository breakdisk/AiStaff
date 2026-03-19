export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function assertAdmin(profileId: string): Promise<boolean> {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT is_admin FROM unified_profiles WHERE id = $1`,
      [profileId],
    );
    return result.rows[0]?.is_admin === true;
  } finally {
    client?.release();
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await assertAdmin(profileId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid UUID" }, { status: 400 });
  }

  const body = await req.json() as { action?: string };
  const action = body.action;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  let client;
  try {
    client = await pool.connect();

    const suggestionResult = await client.query(
      `SELECT tag, domain, status FROM skill_suggestions WHERE id = $1`,
      [id],
    );
    if (suggestionResult.rows.length === 0) {
      return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    }
    const suggestion = suggestionResult.rows[0] as { tag: string; domain: string; status: string };
    if (suggestion.status !== "pending") {
      return NextResponse.json(
        { error: `Already ${suggestion.status}` },
        { status: 409 },
      );
    }

    await client.query("BEGIN");

    if (action === "approve") {
      await client.query(
        `INSERT INTO skill_tags (id, tag, domain)
         VALUES (gen_random_uuid(), $1, $2)
         ON CONFLICT (tag) DO NOTHING`,
        [suggestion.tag, suggestion.domain],
      );
    }

    await client.query(
      `UPDATE skill_suggestions SET status = $1, reviewed_at = NOW() WHERE id = $2`,
      [action === "approve" ? "approved" : "rejected", id],
    );

    await client.query("COMMIT");

    return NextResponse.json({ ok: true, action, tag: suggestion.tag });
  } catch (err) {
    await client?.query("ROLLBACK").catch(() => {});
    console.error("[admin/skill-suggestions/[id] POST]", err);
    return NextResponse.json({ error: "Failed to process suggestion" }, { status: 500 });
  } finally {
    client?.release();
  }
}
