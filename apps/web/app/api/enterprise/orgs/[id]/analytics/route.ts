import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const MARKET = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await fetch(`${MARKET}/enterprise/orgs/${id}/analytics`);
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
