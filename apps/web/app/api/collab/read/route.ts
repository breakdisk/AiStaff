import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const body = await req.json() as { deployment_id: string };
  const r = await fetch(`${MARKETPLACE}/collab/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Profile-Id": profileId },
    body: JSON.stringify(body),
  });
  return new NextResponse(null, { status: r.status });
}
