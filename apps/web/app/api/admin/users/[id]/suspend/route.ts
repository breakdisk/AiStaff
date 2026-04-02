import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin, IDENTITY_URL } from "../../../_auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const body = await req.json();
  const res  = await fetch(`${IDENTITY_URL}/admin/users/${id}/suspend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
