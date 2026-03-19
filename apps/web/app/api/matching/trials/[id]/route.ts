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
  const clientId = (session?.user as { profileId?: string })?.profileId;
  if (!clientId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: trialId } = await params;
  if (!UUID_RE.test(trialId)) {
    return NextResponse.json({ error: "Invalid trial ID" }, { status: 400 });
  }

  const body = await req.json() as {
    action:       unknown;
    end_reason?:  unknown;
    rating?:      unknown;
  };

  const action = body.action;
  if (action !== "convert" && action !== "end" && action !== "rate") {
    return NextResponse.json({ error: "action must be convert | end | rate" }, { status: 400 });
  }

  let client;
  try {
    client = await pool.connect();

    // Verify ownership — allow rating even on CONVERTED/ENDED trials
    const statusFilter = action === "rate" ? `status IN ('ACTIVE', 'CONVERTED', 'ENDED')` : `status = 'ACTIVE'`;
    const check = await client.query(
      `SELECT id FROM trial_engagements WHERE id = $1 AND client_id = $2 AND ${statusFilter}`,
      [trialId, clientId],
    );
    if (check.rows.length === 0) {
      return NextResponse.json({ error: "Trial not found or not yours" }, { status: 404 });
    }

    if (action === "convert") {
      await client.query(
        `UPDATE trial_engagements
            SET status = 'CONVERTED', converted_at = NOW()
          WHERE id = $1`,
        [trialId],
      );
    } else if (action === "end") {
      const reason = typeof body.end_reason === "string" ? body.end_reason.slice(0, 500) : null;
      await client.query(
        `UPDATE trial_engagements
            SET status = 'ENDED', ended_at = NOW(), end_reason = $2
          WHERE id = $1`,
        [trialId, reason],
      );
    } else {
      const rating = typeof body.rating === "number" ? Math.round(body.rating) : null;
      if (!rating || rating < 1 || rating > 5) {
        return NextResponse.json({ error: "rating must be 1–5" }, { status: 400 });
      }
      await client.query(
        `UPDATE trial_engagements SET rating = $2 WHERE id = $1`,
        [trialId, rating],
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/matching/trials/[id]]", err);
    return NextResponse.json({ error: "Failed to update trial" }, { status: 500 });
  } finally {
    client?.release();
  }
}
