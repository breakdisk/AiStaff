import { NextResponse } from "next/server";
import { requireAdmin, MARKETPLACE_URL } from "../../../_auth";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const res  = await fetch(`${MARKETPLACE_URL}/admin/listings/${id}/approve`, { method: "POST" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
