// Public proxy for the e-signature flow — no auth required.
// GET  ?token=   → compliance_service preview (returns contract + document_text)
// POST {token, signer_name} → compliance_service sign-external

import { NextRequest, NextResponse } from "next/server";

const COMPLIANCE = process.env.COMPLIANCE_SERVICE_URL ?? "http://localhost:3006";

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
  const payload = await req.json().catch(() => ({}));

  const upstream = await fetch(`${COMPLIANCE}/contracts/${contractId}/sign-external`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  }).catch(() => null);

  if (!upstream) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  const body = await upstream.json().catch(() => ({}));
  return NextResponse.json(body, { status: upstream.status });
}
