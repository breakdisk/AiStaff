import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const { id } = await params;
  const r = await fetch(`${MARKETPLACE}/collab/messages/${id}/thread`, {
    headers: { "X-Profile-Id": profileId },
  });
  return NextResponse.json(await r.json().catch(() => []), { status: r.status });
}
