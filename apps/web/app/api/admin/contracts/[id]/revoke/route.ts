export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { assertAdmin } from "@/lib/admin";
import { COMPLIANCE_URL } from "@/app/api/admin/_auth";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertAdmin(profileId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const upstream = await fetch(`${COMPLIANCE_URL}/admin/contracts/${id}/revoke`, {
    method: "POST",
    signal: AbortSignal.timeout(5000),
  });

  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  const text = await upstream.text();
  return NextResponse.json({ error: text }, { status: upstream.status });
}
