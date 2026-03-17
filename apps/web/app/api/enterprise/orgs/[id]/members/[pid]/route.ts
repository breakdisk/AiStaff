import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const IDENTITY = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; pid: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, pid } = await params;
  const r = await fetch(`${IDENTITY}/enterprise/orgs/${id}/members/${pid}`, { method: "DELETE" });
  return new NextResponse(null, { status: r.status });
}
