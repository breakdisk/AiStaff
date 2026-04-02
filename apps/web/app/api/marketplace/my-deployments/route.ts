import { auth } from "@/auth";
import { NextResponse } from "next/server";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const r = await fetch(`${MARKETPLACE}/deployments/mine?profile_id=${profileId}`).catch(() => null);
  if (!r) return NextResponse.json([], { status: 200 }); // offline fallback
  return NextResponse.json(await r.json().catch(() => []), { status: r.ok ? 200 : r.status });
}
