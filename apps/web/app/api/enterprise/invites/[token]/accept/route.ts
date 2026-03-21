import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const IDENTITY = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  // Resolve profile_id from session — never trust the client to send it
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profileId = (session.user as { profileId?: string })?.profileId;
  if (!profileId) {
    return NextResponse.json(
      { error: "Your profile is not fully set up yet. Please complete onboarding first." },
      { status: 400 },
    );
  }

  const { token } = await params;

  const r = await fetch(`${IDENTITY}/enterprise/invites/${token}/accept`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ profile_id: profileId }),
  });

  if (!r.ok) {
    const status = r.status;
    if (status === 404) {
      return NextResponse.json(
        { error: "This invitation link has already been used or has expired." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: `Could not accept invitation (${status}). Please try again.` },
      { status },
    );
  }

  return NextResponse.json({ ok: true });
}
