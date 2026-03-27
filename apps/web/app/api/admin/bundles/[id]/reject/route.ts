import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const MKT = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!(session?.user as { isAdmin?: boolean })?.isAdmin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const r = await fetch(`${MKT}/admin/bundles/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
