import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return new NextResponse("No profile", { status: 401 });

  const { slug } = await params;

  const r = await fetch(`${MARKETPLACE}/collab/files/${slug}`, {
    headers: { "X-Profile-Id": profileId },
  });

  if (!r.ok) return new NextResponse(null, { status: r.status });

  const contentType = r.headers.get("content-type") ?? "application/octet-stream";
  return new NextResponse(r.body, {
    status: 200,
    headers: {
      "Content-Type":        contentType,
      "Content-Disposition": `attachment; filename="${slug}"`,
      "Cache-Control":       "private, max-age=3600",
    },
  });
}
