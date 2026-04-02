export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth();
  const talentId = (session?.user as { profileId?: string })?.profileId;
  if (!talentId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: invitationId } = await params;
  if (!UUID_RE.test(invitationId)) {
    return NextResponse.json({ error: "Invalid invitation ID" }, { status: 400 });
  }

  const body = await req.json() as { action: unknown };
  const action = body.action;
  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "action must be accept | decline" }, { status: 400 });
  }

  const newStatus = action === "accept" ? "ACCEPTED" : "DECLINED";

  let client;
  try {
    client = await pool.connect();

    // Verify this invitation belongs to the talent and is still PENDING
    const check = await client.query(
      `SELECT id FROM match_invitations
        WHERE id = $1 AND talent_id = $2 AND status = 'PENDING'`,
      [invitationId, talentId],
    );
    if (check.rows.length === 0) {
      return NextResponse.json({ error: "Invitation not found or already responded" }, { status: 404 });
    }

    await client.query(
      `UPDATE match_invitations
          SET status = $2, responded_at = NOW()
        WHERE id = $1`,
      [invitationId, newStatus],
    );

    return NextResponse.json({ ok: true, status: newStatus });
  } catch (err) {
    console.error("[PATCH /api/matching/invitations/[id]]", err);
    return NextResponse.json({ error: "Failed to respond to invitation" }, { status: 500 });
  } finally {
    client?.release();
  }
}
