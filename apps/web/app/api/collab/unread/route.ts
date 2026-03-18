import { auth } from "@/auth";
import { NextResponse } from "next/server";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ unread: 0 });

  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ unread: 0 });

  const r = await fetch(
    `${MARKETPLACE}/collab/unread?profile_id=${profileId}`,
    { headers: { "X-Profile-Id": profileId } },
  ).catch(() => null);

  if (!r?.ok) return NextResponse.json({ unread: 0 });
  return NextResponse.json(await r.json().catch(() => ({ unread: 0 })));
}
