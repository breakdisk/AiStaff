// Authenticated route: triggers the sign-request on compliance_service,
// then sends the counterparty an email with the sign link.

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import nodemailer from "nodemailer";

const COMPLIANCE = process.env.COMPLIANCE_SERVICE_URL ?? "http://localhost:3006";
const APP_URL    = process.env.AUTH_URL ?? "http://localhost:3000";

function makeTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USERNAME ?? process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS;

  // Dev fallback: MailHog (no auth needed)
  if (!user || user === "REPLACE_WITH_SES_SMTP_USERNAME") {
    return nodemailer.createTransport({ host: process.env.SMTP_HOST ?? "localhost", port, secure: false });
  }
  return nodemailer.createTransport({ host, port, secure: false, auth: { user, pass } });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: contractId } = await params;
  const { party_b_email, party_b_name } = await req.json().catch(() => ({})) as {
    party_b_email?: string;
    party_b_name?:  string;
  };

  if (!party_b_email) return NextResponse.json({ error: "party_b_email required" }, { status: 400 });

  // Ask compliance_service to generate a sign token
  const upstream = await fetch(`${COMPLIANCE}/contracts/${contractId}/request-signature`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ party_b_email }),
  }).catch(() => null);

  if (!upstream?.ok) {
    const msg = await upstream?.text().catch(() => "upstream error");
    return NextResponse.json({ error: msg }, { status: upstream?.status ?? 503 });
  }

  const { sign_token } = await upstream.json() as { sign_token: string };
  const signUrl = `${APP_URL}/sign/${contractId}?token=${sign_token}`;

  // Send email
  const senderName = session.user.name ?? "AiStaff";
  const from       = process.env.SMTP_FROM ?? "noreply@aistaffglobal.com";

  try {
    const transport = makeTransport();
    await transport.sendMail({
      from,
      to:      party_b_email,
      subject: `${senderName} has sent you a document to sign`,
      html: `
<div style="font-family:monospace;background:#09090b;color:#fafafa;padding:24px;max-width:560px">
  <p style="color:#fbbf24;font-size:14px;margin:0 0 16px">AiStaff Legal Toolkit</p>
  <p style="font-size:13px;margin:0 0 12px">
    <strong>${senderName}</strong> has invited you to sign a document.
  </p>
  <p style="font-size:13px;margin:0 0 24px;color:#a1a1aa">
    This link expires in 7 days. Click to review and sign.
  </p>
  <a href="${signUrl}"
     style="display:inline-block;background:#fbbf24;color:#09090b;padding:10px 20px;
            font-weight:bold;text-decoration:none;border-radius:2px;font-size:13px">
    Review &amp; Sign Document →
  </a>
  <p style="font-size:11px;color:#52525b;margin-top:24px">
    If you weren't expecting this, ignore this email.<br/>
    AiStaff · aistaffglobal.com
  </p>
</div>`,
    });
  } catch (e) {
    // Email failed — still return the sign URL so host can share it manually
    console.warn("Email send failed:", e);
  }

  return NextResponse.json({ sign_url: signUrl, sign_token });
}
