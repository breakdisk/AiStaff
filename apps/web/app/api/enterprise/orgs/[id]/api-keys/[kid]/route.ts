import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const IDENTITY = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; kid: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, kid } = await params;
  const r = await fetch(`${IDENTITY}/enterprise/orgs/${id}/api-keys/${kid}`, { method: "DELETE" });
  return new NextResponse(null, { status: r.status });
}
