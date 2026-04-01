export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  const email     = session?.user?.email ?? "freelancer";
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT
         ep.id,
         ep.amount_cents,
         ep.reason,
         ep.created_at,
         ep.deployment_id,
         COALESCE(al.name, 'Freelance Service') AS job_title
       FROM escrow_payouts ep
       LEFT JOIN deployments   d  ON d.id  = ep.deployment_id
       LEFT JOIN agent_listings al ON al.id = d.agent_id
      WHERE ep.id            = $1
        AND ep.recipient_id  = $2`,
      [id, profileId],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Payout not found" }, { status: 404 });
    }

    const p   = rows[0];
    const amt = (Number(p.amount_cents) / 100).toFixed(2);
    const date = new Date(p.created_at).toLocaleDateString("en-GB", {
      day: "2-digit", month: "long", year: "numeric",
    });
    const ref = (p.id as string).slice(0, 8).toUpperCase();

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Invoice ${ref}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', monospace; background: #fff; color: #111; padding: 48px; max-width: 640px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .brand { font-size: 18px; font-weight: bold; letter-spacing: 2px; }
    .brand span { color: #d97706; }
    .invoice-meta { text-align: right; font-size: 12px; color: #666; }
    .invoice-meta h2 { font-size: 22px; font-weight: bold; color: #111; margin-bottom: 4px; }
    .section { margin-bottom: 28px; }
    .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #999; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f9f9f9; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; padding: 8px 12px; text-align: left; }
    td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
    .amount { text-align: right; }
    .total-row td { font-weight: bold; font-size: 15px; border-top: 2px solid #111; border-bottom: none; }
    .sub { font-size: 11px; color: #999; margin-top: 2px; }
    .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #eee; font-size: 11px; color: #aaa; line-height: 1.8; }
    @media print { body { padding: 24px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">AI<span>STAFF</span></div>
    <div class="invoice-meta">
      <h2>INVOICE</h2>
      <div>${date}</div>
      <div>REF: ${ref}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-label">Billed To / From</div>
    <table>
      <tr>
        <td><strong>Freelancer</strong><div class="sub">${email}</div></td>
        <td><strong>Platform</strong><div class="sub">AiStaff · aistaffglobal.com</div></td>
      </tr>
    </table>
  </div>

  <div class="section">
    <div class="section-label">Service Details</div>
    <table>
      <thead><tr><th>Description</th><th class="amount">Amount (USD)</th></tr></thead>
      <tbody>
        <tr>
          <td>
            ${p.job_title}
            <div class="sub">Deployment: ${p.deployment_id ?? '—'}</div>
            <div class="sub">Escrow release · ${p.reason ?? 'payout'}</div>
          </td>
          <td class="amount">$${amt}</td>
        </tr>
        <tr class="total-row">
          <td>Total Received</td>
          <td class="amount">$${amt}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="footer">
    This document confirms an escrow release on the AiStaff platform.<br>
    It is not a formal tax document. Consult your tax adviser for filing requirements.<br>
    AiStaff · aistaffglobal.com · support@aistaffglobal.com
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        "Content-Type":        "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="invoice-${ref}.html"`,
      },
    });
  } finally {
    client.release();
  }
}
