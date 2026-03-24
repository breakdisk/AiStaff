export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { assertAdmin } from "@/lib/admin";
import { PAYOUT_URL } from "@/app/api/admin/_auth";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertAdmin(profileId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const upstream = await fetch(`${PAYOUT_URL}/payouts/${id}/veto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "admin_force_veto", profile_id: profileId }),
  });

  if (upstream.status === 204 || upstream.status === 200) return new NextResponse(null, { status: 204 });
  const text = await upstream.text();
  return NextResponse.json({ error: text }, { status: upstream.status });
}
