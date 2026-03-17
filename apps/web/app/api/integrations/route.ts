import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const deploymentId = req.nextUrl.searchParams.get("deployment_id");
  if (!deploymentId) return NextResponse.json({ error: "deployment_id required" }, { status: 400 });

  const r = await fetch(`${MARKETPLACE}/integrations?deployment_id=${deploymentId}`, {
    headers: { "X-Profile-Id": profileId },
  });
  return NextResponse.json(await r.json().catch(() => []), { status: r.status });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const r = await fetch(`${MARKETPLACE}/integrations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
