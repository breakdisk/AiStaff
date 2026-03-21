import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const IDENTITY = process.env.IDENTITY_SERVICE_URL  ?? "http://localhost:3001";
const NOTIF    = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:3012";
const BASE_URL = process.env.AUTH_URL ?? "https://aistaffglobal.com";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: orgId } = await params;
  const body = await req.json();

  // 1. Create the invite in identity_service
  const r = await fetch(`${IDENTITY}/enterprise/orgs/${orgId}/invite`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

  const data = await r.json().catch(() => ({})) as {
    token?: string;
    invitee_email?: string;
    expires_at?: string;
    error?: string;
  };

  if (!r.ok) {
    return NextResponse.json(data, { status: r.status });
  }

  // 2. Fetch org name for the email body (best-effort)
  let orgName = "your organisation";
  try {
    const orgRes = await fetch(`${IDENTITY}/enterprise/orgs/${orgId}`);
    if (orgRes.ok) {
      const org = await orgRes.json() as { name?: string };
      if (org.name) orgName = org.name;
    }
  } catch { /* non-fatal */ }

  // 3. Send invitation email via notification_service
  if (data.token && data.invitee_email) {
    const inviteUrl  = `${BASE_URL}/enterprise/join?token=${data.token}`;
    const inviterName =
      (session.user as { name?: string | null }).name ??
      (session.user as { email?: string | null }).email ??
      "A team member";
    const expiresDate = data.expires_at
      ? new Date(data.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : "7 days from now";

    await fetch(`${NOTIF}/notify`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient_email: data.invitee_email,
        subject: `${inviterName} invited you to join ${orgName} on AiStaff`,
        body:
          `${inviterName} has invited you to join the ${orgName} organisation on AiStaff.\n\n` +
          `Accept your invitation here:\n${inviteUrl}\n\n` +
          `This link expires on ${expiresDate}.\n\n` +
          `If you don't have an AiStaff account yet, you can create one when you follow the link above.\n\n` +
          `— AiStaff`,
      }),
    }).catch((e) => console.error("[enterprise-invite] email failed:", e));
  }

  return NextResponse.json(data, { status: r.status });
}
