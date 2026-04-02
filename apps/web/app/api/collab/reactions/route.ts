import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const r = await fetch(`${MARKETPLACE}/collab/reactions`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-Profile-Id": profileId },
    body:    JSON.stringify(await req.json()),
  });
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
