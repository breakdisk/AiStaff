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
    talent_id:   unknown;
    listing_id?: unknown;
    message?:    unknown;
  };

  const talentId  = body.talent_id;
  const listingId = body.listing_id ?? null;

  if (typeof talentId !== "string" || !UUID_RE.test(talentId)) {
    return NextResponse.json({ error: "talent_id must be a valid UUID" }, { status: 400 });
  }
  if (listingId !== null && (typeof listingId !== "string" || !UUID_RE.test(listingId))) {
    return NextResponse.json({ error: "listing_id must be a valid UUID" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.slice(0, 1000) : null;

  let client;
  try {
    client = await pool.connect();

    const result = await client.query(
      `INSERT INTO match_invitations (client_id, talent_id, listing_id, message)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [clientId, talentId, listingId, message],
    );
    const row = result.rows[0] as { id: string; created_at: Date };
    const { id: invitation_id, created_at } = row;

    // Notify talent — fetch email from unified_profiles
    const profileRow = await client.query(
      `SELECT email, display_name FROM unified_profiles WHERE id = $1`,
      [talentId],
    );
    if (profileRow.rows.length > 0) {
      const { email, display_name } = profileRow.rows[0] as { email: string; display_name: string };
      await tryNotify({
        recipient_email: email,
        subject:         "You have been invited to a project on AiStaff",
        body:
          `Hi ${display_name || "there"},\n\n` +
          `A client has invited you to collaborate on a project.\n\n` +
          (message ? `Message: ${message}\n\n` : "") +
          `Log in to AiStaff to view and respond to the invitation.\n\n` +
          `invitation_id: ${invitation_id}`,
      });
    }

    return NextResponse.json({ invitation_id, created_at: created_at.toISOString() });
  } catch (err) {
    console.error("[POST /api/matching/invitations]", err);
    return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 });
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
      `SELECT id, talent_id, listing_id, message, status, created_at, responded_at
         FROM match_invitations
        WHERE client_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [clientId],
    );
    return NextResponse.json({ invitations: result.rows });
  } catch (err) {
    console.error("[GET /api/matching/invitations]", err);
    return NextResponse.json({ invitations: [] }, { status: 500 });
  } finally {
    client?.release();
  }
}
