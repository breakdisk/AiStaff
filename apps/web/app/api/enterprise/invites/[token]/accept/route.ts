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
    email?:        string | null;
    name?:         string | null;
    identityTier?: string;
  };

  const profileId    = user.profileId;
  const userEmail    = (user.email ?? "").toLowerCase().trim();
  const identityTier = user.identityTier ?? "UNVERIFIED";
  const displayName  = user.name ?? userEmail;

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

  // ── Gate 2: email match + fetch org/owner info ─────────────────────────────
  // Single query: validate token, get invitee email, org name, owner details.
  let inviteeEmail: string;
  let orgName:      string;
  let ownerUserId:  string;
  let ownerEmail:   string | null;

  const client = await pool.connect();
  try {
    const { rows } = await client.query<{
      invitee_email: string;
      org_name:      string;
      owner_id:      string;
      owner_email:   string | null;
    }>(
      `SELECT oi.invitee_email,
              o.name          AS org_name,
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

    inviteeEmail = rows[0].invitee_email.toLowerCase().trim();
    orgName      = rows[0].org_name;
    ownerUserId  = rows[0].owner_id;
    ownerEmail   = rows[0].owner_email;
  } finally {
    client.release();
  }

  // The invitation was addressed to a specific email — enforce it.
  if (userEmail !== inviteeEmail) {
    return NextResponse.json(
      {
        error:
          `This invitation was sent to ${inviteeEmail}. ` +
          `Please sign in with that email address to accept.`,
      },
      { status: 403 },
    );
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
