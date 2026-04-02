import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const deploymentId = searchParams.get("deployment_id");

  const qs = deploymentId
    ? `deployment_id=${deploymentId}`
    : `profile_id=${profileId}`;

  const res = await fetch(`${MARKETPLACE}/quality-gate/scans?${qs}`, {
    headers: { "X-Profile-Id": profileId },
  }).catch(() => null);

  if (!res?.ok) return NextResponse.json({ scans: [] });
  return NextResponse.json(await res.json());
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const body = await req.json();
  const res = await fetch(`${MARKETPLACE}/quality-gate/scans`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Profile-Id": profileId },
    body: JSON.stringify({ ...body, uploaded_by: profileId }),
  }).catch(() => null);

  if (!res?.ok) {
    const text = await res?.text();
    return NextResponse.json({ error: text ?? "Failed" }, { status: res?.status ?? 500 });
  }
  return NextResponse.json(await res.json(), { status: 201 });
}
