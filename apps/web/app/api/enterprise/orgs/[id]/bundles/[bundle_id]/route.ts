import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const MKT = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; bundle_id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, bundle_id } = await params;
  const body = await req.json();
  const r = await fetch(`${MKT}/enterprise/orgs/${id}/bundles/${bundle_id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; bundle_id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, bundle_id } = await params;
  const r = await fetch(`${MKT}/enterprise/orgs/${id}/bundles/${bundle_id}`, {
    method: "DELETE",
  });
  if (r.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
