import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin, MARKETPLACE_URL } from "../_auth";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const qs  = req.nextUrl.search;
  const res = await fetch(`${MARKETPLACE_URL}/admin/deployments${qs}`, { cache: "no-store" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
