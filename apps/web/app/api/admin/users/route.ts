import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin, IDENTITY_URL } from "../_auth";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const qs  = req.nextUrl.search;
  const res = await fetch(`${IDENTITY_URL}/admin/users${qs}`, { cache: "no-store" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
