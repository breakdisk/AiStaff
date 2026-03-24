export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { assertAdmin } from "@/lib/admin";
import { COMPLIANCE_URL } from "@/app/api/admin/_auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertAdmin(profileId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { resolution?: string };
  const valid = ["REMEDIATED", "REFUNDED", "REJECTED"];
  if (!body.resolution || !valid.includes(body.resolution)) {
    return NextResponse.json({ error: "resolution must be REMEDIATED | REFUNDED | REJECTED" }, { status: 400 });
  }

  const upstream = await fetch(`${COMPLIANCE_URL}/warranty-claims/${id}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resolution: body.resolution }),
    signal: AbortSignal.timeout(5000),
  });

  if (upstream.status === 204 || upstream.status === 200) return new NextResponse(null, { status: 204 });
  const text = await upstream.text();
  return NextResponse.json({ error: text }, { status: upstream.status });
}
