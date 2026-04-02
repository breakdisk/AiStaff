export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

export async function POST(_req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = session.user.email;
  const name  = session.user.name ?? "there";
  const role  = session.user.role ?? "client";

  const notifUrl =
    process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:3012";

  try {
    const res = await fetch(`${notifUrl}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient_email: email,
        subject: "Welcome to AiStaff — you're all set",
        body:
          `Hi ${name},\n\n` +
          `Your AiStaff account is ready. You joined as a ${role}.\n\n` +
          `Head to the marketplace to deploy your first AI agent:\n` +
          `${process.env.NEXT_PUBLIC_APP_URL ?? "https://aistaffglobal.com"}/marketplace\n\n` +
          `Every deployment is protected by a 30-second veto window and a 7-day warranty.\n\n` +
          `— The AiStaff team`,
      }),
      signal: AbortSignal.timeout(2000),
    });
    return NextResponse.json({ sent: res.ok });
  } catch {
    // notification_service offline — non-fatal, user is not blocked
    return NextResponse.json({ sent: false });
  }
}
