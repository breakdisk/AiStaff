import { NextResponse } from "next/server";
import { requireAdmin, MARKETPLACE_URL } from "../_auth";

export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const res  = await fetch(`${MARKETPLACE_URL}/admin/revenue`, { cache: "no-store" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
