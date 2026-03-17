import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? "";

function verifySignature(rawBody: string, signature: string): boolean {
  // If no secret is configured (dev without webhook), skip verification
  if (!GITHUB_WEBHOOK_SECRET) return true;

  const hmac = crypto.createHmac("sha256", GITHUB_WEBHOOK_SECRET);
  hmac.update(rawBody);
  const expected = `sha256=${hmac.digest("hex")}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function buildTitle(event: string, payload: Record<string, unknown>): { title: string; externalId: string } {
  const repoName = (payload.repository as { full_name?: string } | undefined)?.full_name ?? "unknown";

  if (event === "push") {
    const ref    = ((payload.ref as string | undefined) ?? "").replace("refs/heads/", "");
    const count  = (payload.commits as unknown[] | undefined)?.length ?? 0;
    return {
      title:      `Push: ${ref} — ${count} commit${count !== 1 ? "s" : ""}`,
      externalId: repoName,
    };
  }

  if (event === "pull_request") {
    const action = payload.action as string | undefined;
    const pr     = payload.pull_request as { title?: string; number?: number } | undefined;
    return {
      title:      `PR #${pr?.number ?? "?"}: ${pr?.title ?? "untitled"} (${action ?? "event"})`,
      externalId: repoName,
    };
  }

  return { title: `${event} event`, externalId: repoName };
}

export async function POST(req: NextRequest) {
  const rawBody  = await req.text();
  const signature = req.headers.get("x-hub-signature-256") ?? "";

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event") ?? "unknown";

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, externalId } = buildTitle(event, payload);

  // Look up integration by external_id (repo full_name)
  const intRes = await fetch(
    `${MARKETPLACE}/integrations/by-external-id?external_id=${encodeURIComponent(externalId)}`,
  ).catch(() => null);

  if (!intRes?.ok) {
    // No matching integration — silently acknowledge (GitHub requires 2xx)
    return NextResponse.json({ ok: true });
  }

  const integration = await intRes.json().catch(() => null) as { id?: string } | null;
  if (!integration?.id) return NextResponse.json({ ok: true });

  // Persist the event
  await fetch(`${MARKETPLACE}/integrations/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      integration_id: integration.id,
      event_type:     event,
      title,
    }),
  }).catch(() => null);

  return NextResponse.json({ ok: true });
}
