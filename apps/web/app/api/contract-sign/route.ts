// POST /api/contract-sign
// Wraps compliance_service sign-external, then notifies Party A by email
// and in-app that their contract has been signed.
// Static path — avoids /api/compliance/:path* rewrite interception.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

const COMPLIANCE_URL  = process.env.COMPLIANCE_SERVICE_URL  ?? "http://localhost:3006";
const NOTIF_URL       = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:3012";

async function notify(to: string, subject: string, body: string) {
  await fetch(`${NOTIF_URL}/notify`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ recipient_email: to, subject, body }),
  }).catch((e) => console.error("[contract-sign] email failed:", e));
}

async function inAppNotify(userId: string, title: string, body: string) {
  await fetch(`${NOTIF_URL}/notify-inapp`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ user_id: userId, title, body, event_type: "ContractSigned", priority: "normal" }),
  }).catch(() => {}); // best-effort
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { contract_id?: string; token?: string; signer_name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { contract_id, token, signer_name } = body;
  if (!contract_id || !token || !signer_name) {
    return NextResponse.json({ error: "contract_id, token and signer_name required" }, { status: 400 });
  }

  // Call compliance_service to record the signature
  let partyAEmail: string | null = null;
  let partyBEmail: string | null = null;
  try {
    const res = await fetch(
      `${COMPLIANCE_URL}/contracts/${contract_id}/sign-external`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, signer_name }),
      },
    );
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }
    const data = await res.json() as { party_a_email?: string; party_b_email?: string };
    partyAEmail = data.party_a_email ?? null;
    partyBEmail = data.party_b_email ?? null;
  } catch (e) {
    console.error("[contract-sign] compliance_service error:", e);
    return NextResponse.json({ error: "Compliance service unavailable" }, { status: 502 });
  }

  // Email Party A — their contract is now fully signed
  if (partyAEmail) {
    await notify(
      partyAEmail,
      "Contract signed — AiStaff",
      `Great news! ${signer_name} has signed your contract.\n\n` +
      `The agreement is now fully executed. Both parties have agreed to the terms.\n\n` +
      `Log in to AiStaff to view the signed document:\n` +
      `${process.env.AUTH_URL ?? "https://aistaffglobal.com"}/legal-toolkit\n\n` +
      `— AiStaff Legal`,
    );

    // In-app notification for Party A — look up their user_id by email
    try {
      const client = await pool.connect();
      try {
        const row = await client.query(
          "SELECT id FROM unified_profiles WHERE email = $1 LIMIT 1",
          [partyAEmail],
        );
        if (row.rows[0]?.id) {
          await inAppNotify(
            row.rows[0].id,
            "Contract signed",
            `${signer_name} has signed your contract. The agreement is now fully executed.`,
          );
        }
      } finally {
        client.release();
      }
    } catch { /* best-effort */ }
  }

  // Email Party B — confirmation of their signature
  if (partyBEmail) {
    await notify(
      partyBEmail,
      "You have signed a contract — AiStaff",
      `This confirms your signature on the contract.\n\n` +
      `Both parties have now signed. The agreement is fully executed.\n\n` +
      `— AiStaff Legal`,
    );
  }

  return NextResponse.json({ ok: true });
}
