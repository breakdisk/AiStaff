// Public proxy for the e-signature flow — no auth required.
// GET  ?token=   → compliance_service preview (returns contract + document_text)
// POST {token, signer_name} → compliance_service sign-external, then sends confirmation emails

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

const COMPLIANCE = process.env.COMPLIANCE_SERVICE_URL ?? "http://localhost:3006";
const APP_URL    = process.env.AUTH_URL ?? "http://localhost:3000";

function makeTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USERNAME ?? process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS;

  if (!user || user === "REPLACE_WITH_SES_SMTP_USERNAME") {
    return nodemailer.createTransport({ host: process.env.SMTP_HOST ?? "localhost", port, secure: false });
  }
  return nodemailer.createTransport({ host, port, secure: false, auth: { user, pass } });
}

async function sendConfirmations(
  contractId:   string,
  contractType: string,
  documentHash: string,
  signerName:   string,
  partyAEmail:  string | null,
  partyBEmail:  string | null,
) {
  if (!partyAEmail && !partyBEmail) return;
  const from = process.env.SMTP_FROM ?? "noreply@aistaffglobal.com";
  const dashboardUrl = `${APP_URL}/legal-toolkit`;

  const html = `
<div style="font-family:monospace;background:#09090b;color:#fafafa;padding:24px;max-width:560px">
  <p style="color:#fbbf24;font-size:14px;margin:0 0 16px">AiStaff Legal Toolkit</p>
  <p style="font-size:13px;margin:0 0 8px">
    ✓ <strong>${contractType.replace(/_/g, " ").toUpperCase()}</strong> has been fully signed by both parties.
  </p>
  <p style="font-size:13px;margin:0 0 8px;color:#a1a1aa">
    Counterparty signature: <strong>${signerName}</strong>
  </p>
  <div style="background:#18181b;border:1px solid #27272a;padding:10px;margin:16px 0;border-radius:2px">
    <p style="font-size:10px;color:#52525b;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 4px">
      Document integrity (SHA-256)
    </p>
    <p style="font-size:11px;color:#a1a1aa;word-break:break-all;margin:0">${documentHash}</p>
  </div>
  <a href="${dashboardUrl}"
     style="display:inline-block;background:#fbbf24;color:#09090b;padding:10px 20px;
            font-weight:bold;text-decoration:none;border-radius:2px;font-size:13px">
    View in Legal Toolkit →
  </a>
  <p style="font-size:11px;color:#52525b;margin-top:24px">
    AiStaff · aistaffglobal.com
  </p>
</div>`;

  try {
    const transport = makeTransport();
    const to = [partyAEmail, partyBEmail].filter(Boolean).join(", ");
    await transport.sendMail({
      from,
      to,
      subject: `Document fully executed — ${contractType.replace(/_/g, " ")}`,
      html,
    });
  } catch (e) {
    console.warn("Confirmation email failed:", e);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ contractId: string }> },
): Promise<NextResponse> {
  const { contractId } = await params;
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const upstream = await fetch(
    `${COMPLIANCE}/contracts/${contractId}/preview?token=${encodeURIComponent(token)}`,
  ).catch(() => null);

  if (!upstream) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  const body = await upstream.json();
  return NextResponse.json(body, { status: upstream.status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ contractId: string }> },
): Promise<NextResponse> {
  const { contractId } = await params;
  const payload = await req.json().catch(() => ({})) as {
    token?: string;
    signer_name?: string;
  };

  const upstream = await fetch(`${COMPLIANCE}/contracts/${contractId}/sign-external`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  }).catch(() => null);

  if (!upstream) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const body = await upstream.json().catch(() => ({})) as {
    ok?:            boolean;
    party_a_email?: string | null;
    party_b_email?: string | null;
    signer_name?:   string;
    error?:         string;
  };

  if (upstream.ok && body.ok) {
    // Fetch contract type + hash for the confirmation email
    const meta = await fetch(
      `${COMPLIANCE}/contracts/${contractId}/preview?token=${encodeURIComponent(payload.token ?? "")}`,
    )
      .then(r => r.json())
      .catch(() => null) as { contract_type?: string; document_hash?: string } | null;

    void sendConfirmations(
      contractId,
      meta?.contract_type ?? "contract",
      meta?.document_hash ?? "",
      payload.signer_name ?? body.signer_name ?? "Counterparty",
      body.party_a_email ?? null,
      body.party_b_email ?? null,
    );
  }

  return NextResponse.json(body, { status: upstream.status });
}
