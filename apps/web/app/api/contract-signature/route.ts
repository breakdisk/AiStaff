// POST /api/contract-signature
// Wraps compliance_service request-signature, constructs sign URL, emails both parties.
// Static path avoids the /api/compliance/:path* rewrite intercepting dynamic routes.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const NOTIF_URL = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:3012";

async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  await fetch(`${NOTIF_URL}/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_email: to, subject, body }),
  }).catch((e) => console.error("[contract-signature] notify failed:", e));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { contract_id?: string; party_b_email?: string; party_a_email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { contract_id, party_b_email, party_a_email } = body;
  if (!contract_id || !party_b_email) {
    return NextResponse.json({ error: "contract_id and party_b_email required" }, { status: 400 });
  }

  // Ask compliance_service to generate the sign token
  const complianceUrl = process.env.COMPLIANCE_SERVICE_URL ?? "http://localhost:3006";
  let sign_token: string;
  try {
    const res = await fetch(
      `${complianceUrl}/contracts/${contract_id}/request-signature`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ party_b_email }),
      },
    );
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }
    const data = (await res.json()) as { sign_token?: string };
    sign_token = data.sign_token ?? "";
  } catch (err) {
    console.error("[contract-signature] compliance_service error:", err);
    return NextResponse.json({ error: "Compliance service unavailable" }, { status: 502 });
  }

  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "https://aistaffglobal.com";
  const sign_url = `${baseUrl}/sign-contract/${contract_id}?token=${sign_token}`;

  // Email party B — signing invitation
  await sendEmail(
    party_b_email,
    "You have been invited to sign a contract — AiStaff",
    `You have been invited to review and sign a contract on AiStaff.\n\n` +
    `Click the link below to view and sign the document:\n\n` +
    `${sign_url}\n\n` +
    `This link expires in 7 days. If you did not expect this invitation, you can ignore this email.\n\n` +
    `— AiStaff Legal`,
  );

  // Email party A — confirmation that request was sent
  if (party_a_email) {
    await sendEmail(
      party_a_email,
      "Signature request sent — AiStaff",
      `Your signature request has been sent to ${party_b_email}.\n\n` +
      `They will receive an email with a secure link to review and sign the document.\n\n` +
      `You will be notified once they have signed.\n\n` +
      `— AiStaff Legal`,
    );
  }

  return NextResponse.json({ sign_url, sign_token });
}
