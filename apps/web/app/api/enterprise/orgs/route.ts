import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const IDENTITY = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const r = await fetch(`${IDENTITY}/enterprise/orgs-create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = req.nextUrl.searchParams.get("profile_id");
  const r = await fetch(`${IDENTITY}/enterprise/orgs/my?profile_id=${profileId}`);
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
