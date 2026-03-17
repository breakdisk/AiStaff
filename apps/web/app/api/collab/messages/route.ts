import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const deploymentId = req.nextUrl.searchParams.get("deployment_id");
  if (!deploymentId) return NextResponse.json({ error: "deployment_id required" }, { status: 400 });
  const r = await fetch(`${MARKETPLACE}/collab/messages?deployment_id=${deploymentId}`);
  return NextResponse.json(await r.json().catch(() => []), { status: r.status });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const r = await fetch(`${MARKETPLACE}/collab/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
