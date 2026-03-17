import { auth } from "@/auth";
import { NextResponse } from "next/server";
const IDENTITY = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

export async function GET() {
  const session = await auth();
  const user = session?.user as { isAdmin?: boolean } | undefined;
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const r = await fetch(`${IDENTITY}/admin/enterprises`);
  return NextResponse.json(await r.json().catch(() => []), { status: r.status });
}
