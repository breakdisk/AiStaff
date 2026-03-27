import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const MKT = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await fetch(`${MKT}/enterprise/orgs/${id}/bundles`);
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const r = await fetch(`${MKT}/enterprise/orgs/${id}/bundles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
