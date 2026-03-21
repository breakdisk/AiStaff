import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const { id } = await params;
  const r = await fetch(`${MARKETPLACE}/collab/messages/${id}`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json", "X-Profile-Id": profileId },
    body:    JSON.stringify(await req.json()),
  });
  return new NextResponse(null, { status: r.status });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const { id } = await params;
  const r = await fetch(`${MARKETPLACE}/collab/messages/${id}`, {
    method:  "DELETE",
    headers: { "X-Profile-Id": profileId },
  });
  return new NextResponse(null, { status: r.status });
}
