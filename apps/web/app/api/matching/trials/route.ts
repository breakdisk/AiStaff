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

async function tryNotify(payload: {
  recipient_email: string;
  subject:         string;
  body:            string;
}): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:3012/notify", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const clientId = (session?.user as { profileId?: string })?.profileId;
  if (!clientId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as {
    talent_id:          unknown;
    trial_rate_cents?:  unknown;
    listing_id?:        unknown;
  };

  const talentId       = body.talent_id;
  const trialRateCents = typeof body.trial_rate_cents === "number" ? body.trial_rate_cents : 0;
  const listingId      = body.listing_id ?? null;

  if (typeof talentId !== "string" || !UUID_RE.test(talentId)) {
    return NextResponse.json({ error: "talent_id must be a valid UUID" }, { status: 400 });
  }
  if (listingId !== null && (typeof listingId !== "string" || !UUID_RE.test(listingId))) {
    return NextResponse.json({ error: "listing_id must be a valid UUID" }, { status: 400 });
  }

  let client;
  try {
    client = await pool.connect();

    const result = await client.query(
      `INSERT INTO trial_engagements (client_id, talent_id, listing_id, trial_rate_cents)
       VALUES ($1, $2, $3, $4)
       RETURNING id, started_at`,
      [clientId, talentId, listingId, trialRateCents],
    );
    const row = result.rows[0] as { id: string; started_at: Date };
    const { id: trial_id, started_at } = row;

    const day3Deadline  = new Date(started_at.getTime() + 3  * 24 * 60 * 60 * 1000).toISOString();
    const day14Deadline = new Date(started_at.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

    // Notify talent
    const profileRow = await client.query(
      `SELECT email, display_name FROM unified_profiles WHERE id = $1`,
      [talentId],
    );
    if (profileRow.rows.length > 0) {
      const { email, display_name } = profileRow.rows[0] as { email: string; display_name: string };
      await tryNotify({
        recipient_email: email,
        subject:         "Your trial engagement has started on AiStaff",
        body:
          `Hi ${display_name || "there"},\n\n` +
          `A client has started a trial engagement with you.\n\n` +
          `Trial rate: ${(trialRateCents / 100).toFixed(2)} / hr\n` +
          `Money-back guarantee window closes: ${day3Deadline}\n` +
          `Trial period ends: ${day14Deadline}\n\n` +
          `trial_id: ${trial_id}`,
      });
    }

    return NextResponse.json({
      trial_id,
      started_at:     started_at.toISOString(),
      day3_deadline:  day3Deadline,
      day14_deadline: day14Deadline,
    });
  } catch (err) {
    console.error("[POST /api/matching/trials]", err);
    return NextResponse.json({ error: "Failed to start trial" }, { status: 500 });
  } finally {
    client?.release();
  }
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  const clientId = (session?.user as { profileId?: string })?.profileId;
  if (!clientId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT id, talent_id, listing_id, trial_rate_cents, status,
              rating, started_at, converted_at, ended_at, end_reason
         FROM trial_engagements
        WHERE client_id = $1
          AND status = 'ACTIVE'
        ORDER BY started_at DESC
        LIMIT 20`,
      [clientId],
    );
    return NextResponse.json({ trials: result.rows });
  } catch (err) {
    console.error("[GET /api/matching/trials]", err);
    return NextResponse.json({ trials: [] }, { status: 500 });
  } finally {
    client?.release();
  }
}
