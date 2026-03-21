import { auth } from "@/auth";
import { NextRequest } from "next/server";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";
const POLL_INTERVAL_MS      = 1_000;
const KEEPALIVE_INTERVAL_MS = 15_000;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return new Response("No profile", { status: 401 });

  const deploymentId = req.nextUrl.searchParams.get("deployment_id");
  if (!deploymentId) return new Response("deployment_id required", { status: 400 });

  const encoder = new TextEncoder();
  let lastTs: string = new Date().toISOString();
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      async function fetchAndPush(after?: string) {
        try {
          const qs  = after ? `&after=${encodeURIComponent(after)}` : "";
          const url = `${MARKETPLACE}/collab/messages?deployment_id=${deploymentId}${qs}`;
          const r   = await fetch(url, {
            headers: { "X-Profile-Id": profileId! },
          });
          if (!r.ok) return;
          const msgs: unknown[] = await r.json().catch(() => []);
          if (Array.isArray(msgs) && msgs.length > 0) {
            lastTs = new Date().toISOString();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(msgs)}\n\n`));
          }
        } catch { /* network error — keep polling */ }
      }

      // Initial fetch — no after param, gets last 200 messages
      await fetchAndPush();
      lastTs = new Date().toISOString();

      // Incremental poll every 1s
      pollTimer = setInterval(() => void fetchAndPush(lastTs), POLL_INTERVAL_MS);

      // Keepalive comment every 15s
      keepaliveTimer = setInterval(() => {
        try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { /* closed */ }
      }, KEEPALIVE_INTERVAL_MS);
    },
    cancel() {
      if (pollTimer)      clearInterval(pollTimer);
      if (keepaliveTimer) clearInterval(keepaliveTimer);
    },
  });

  req.signal.addEventListener("abort", () => {
    if (pollTimer)      clearInterval(pollTimer);
    if (keepaliveTimer) clearInterval(keepaliveTimer);
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
