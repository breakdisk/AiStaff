export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

interface AuditEvent {
  event_type: string;
  event_data: Record<string, unknown>;
}

interface AuditEventsBody {
  events: AuditEvent[];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: AuditEventsBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.events) || body.events.length === 0) {
    return NextResponse.json({ error: "events array required" }, { status: 400 });
  }

  const identityUrl =
    process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

  try {
    const res = await fetch(`${identityUrl}/identity/audit-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // profile_id is ALWAYS sourced from the server-side session —
        // never trusted from the client request body.
        profile_id: session.user.profileId,
        events: body.events,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) return new NextResponse(null, { status: 204 });
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: "identity_service error", detail: text },
      { status: res.status }
    );
  } catch (err) {
    // identity_service offline — log but don't block the user
    console.error("[audit-events] identity_service unreachable:", err);
    return NextResponse.json({ error: "service unavailable" }, { status: 503 });
  }
}
