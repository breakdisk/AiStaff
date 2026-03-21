import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const deploymentId = req.nextUrl.searchParams.get("deployment_id");
  if (!deploymentId) return NextResponse.json({ error: "deployment_id required" }, { status: 400 });

  const contentType = req.headers.get("content-type") ?? "";
  const r = await fetch(
    `${MARKETPLACE}/collab/files?deployment_id=${deploymentId}`,
    {
      method:  "POST",
      headers: { "X-Profile-Id": profileId, "content-type": contentType },
      body:    req.body,
      // @ts-expect-error — Next.js 15 fetch supports duplex streaming
      duplex:  "half",
    },
  );
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
