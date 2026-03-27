import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const MKT = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const callerProfileId = req.nextUrl.searchParams.get("caller_profile_id") ?? "";
  const r = await fetch(
    `${MKT}/enterprise/orgs/${id}/proposals?caller_profile_id=${encodeURIComponent(callerProfileId)}`,
  );
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
