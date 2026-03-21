import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const IDENTITY = process.env.IDENTITY_SERVICE_URL    ?? "http://localhost:3001";
const NOTIF    = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:3012";
const BASE_URL = process.env.AUTH_URL                 ?? "https://aistaffglobal.com";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  // ── Session ────────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as {
    profileId?:    string;
    name?:         string | null;
    email?:        string | null;   // fallback for displayName only
    identityTier?: string;
  };

  const profileId    = user.profileId;
  const identityTier = user.identityTier ?? "UNVERIFIED";
  const displayName  = user.name ?? (user.email ?? "");

  if (!profileId) {
    return NextResponse.json(
      { error: "Your profile is not fully set up yet. Please complete onboarding first." },
      { status: 400 },
    );
  }

  // ── Gate 1: T1 minimum (SOCIAL_VERIFIED or better) ────────────────────────
  if (identityTier === "UNVERIFIED") {
    return NextResponse.json(
      {
        error:
          "You must connect at least one social account (GitHub, Google, or LinkedIn) " +
          "before joining an organisation. Visit your Profile to verify.",
      },
      { status: 403 },
    );
  }

  const { token } = await params;

  // ── Fetch org/owner info from the invite token ────────────────────────────
  let orgName:     string;
  let ownerUserId: string;
  let ownerEmail:  string | null;

  const client = await pool.connect();
  try {
    const { rows } = await client.query<{
      org_name:    string;
      owner_id:    string;
      owner_email: string | null;
    }>(
      `SELECT o.name          AS org_name,
              o.owner_id::text,
              up.email        AS owner_email
       FROM   org_invites       oi
       JOIN   organisations      o  ON o.id  = oi.org_id
       JOIN   unified_profiles   up ON up.id = o.owner_id
       WHERE  oi.token       = $1
         AND  oi.accepted_at IS NULL
         AND  oi.expires_at  > NOW()
       LIMIT  1`,
      [token],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "This invitation link has already been used or has expired." },
        { status: 404 },
      );
    }

    orgName      = rows[0].org_name;
    ownerUserId  = rows[0].owner_id;
    ownerEmail   = rows[0].owner_email;
  } finally {
    client.release();
  }

  // ── Record membership via identity_service ─────────────────────────────────
  const r = await fetch(`${IDENTITY}/enterprise/invites/${token}/accept`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ profile_id: profileId }),
  });

  if (!r.ok) {
    if (r.status === 404) {
      return NextResponse.json(
        { error: "This invitation link has already been used or has expired." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: `Could not accept invitation (${r.status}). Please try again.` },
      { status: r.status },
    );
  }

  // ── Gate 3: notify the org owner (best-effort — never blocks the accept) ───
  const notifTitle = "New team member joined";
  const notifBody  =
    `${displayName} accepted your invitation and joined ${orgName} as a member.`;

  // In-app bell notification
  fetch(`${NOTIF}/notify-inapp`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id:    ownerUserId,
      title:      notifTitle,
      body:       notifBody,
      event_type: "EnterpriseInviteAccepted",
      priority:   "normal",
    }),
  }).catch(() => {});

  // Email notification to admin
  if (ownerEmail) {
    fetch(`${NOTIF}/notify`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient_email: ownerEmail,
        subject:         `${displayName} joined ${orgName} — AiStaff`,
        body:
          `${notifBody}\n\n` +
          `View your team:\n` +
          `${BASE_URL}/enterprise/members\n\n` +
          `— AiStaff`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
