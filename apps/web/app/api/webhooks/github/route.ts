import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { Pool } from "pg";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? "";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function verifySignature(rawBody: string, signature: string): boolean {
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
    const ref   = ((payload.ref as string | undefined) ?? "").replace("refs/heads/", "");
    const count = (payload.commits as unknown[] | undefined)?.length ?? 0;
    return { title: `Push: ${ref} — ${count} commit${count !== 1 ? "s" : ""}`, externalId: repoName };
  }
  if (event === "pull_request") {
    const action = payload.action as string | undefined;
    const pr     = payload.pull_request as { title?: string; number?: number } | undefined;
    return { title: `PR #${pr?.number ?? "?"}: ${pr?.title ?? "untitled"} (${action ?? "event"})`, externalId: repoName };
  }
  return { title: `${event} event`, externalId: repoName };
}

interface GithubCommit {
  id:      string;
  message: string;
  author:  { date: string };
  added:   string[];
  modified: string[];
  removed: string[];
}

async function handleWorkDiarySessions(
  integrationId: string,
  ownerProfileId: string,
  commits: GithubCommit[],
) {
  // Sort commits by author timestamp (oldest first)
  const sorted = [...commits].sort(
    (a, b) => new Date(a.author.date).getTime() - new Date(b.author.date).getTime(),
  );

  const client = await pool.connect();
  try {
    for (const commit of sorted) {
      const msg        = commit.message.trim();
      const authorDate = new Date(commit.author.date);
      const sessionDate = authorDate.toISOString().slice(0, 10); // YYYY-MM-DD

      if (msg.toUpperCase().startsWith("[START]")) {
        // Open a new session — close any orphaned open session first
        await client.query(
          `UPDATE work_diary_sessions
           SET ended_at = $1
           WHERE integration_id = $2 AND ended_at IS NULL`,
          [authorDate, integrationId],
        );
        await client.query(
          `INSERT INTO work_diary_sessions
             (integration_id, owner_profile_id, session_date, started_at)
           VALUES ($1, $2, $3, $4)`,
          [integrationId, ownerProfileId, sessionDate, authorDate],
        );
      } else if (msg.toUpperCase().startsWith("[END]")) {
        // Close the most recent open session for this integration
        await client.query(
          `UPDATE work_diary_sessions
           SET ended_at = $1
           WHERE integration_id = $2 AND ended_at IS NULL
             AND id = (
               SELECT id FROM work_diary_sessions
               WHERE integration_id = $2 AND ended_at IS NULL
               ORDER BY started_at DESC LIMIT 1
             )`,
          [authorDate, integrationId],
        );
      } else {
        // Regular code commit — accumulate into open session
        const files = [...commit.added, ...commit.modified, ...commit.removed];
        await client.query(
          `UPDATE work_diary_sessions
           SET commit_count    = commit_count + 1,
               files_count     = files_count + $1,
               commit_messages = commit_messages || $2::text[]
           WHERE integration_id = $3 AND ended_at IS NULL
             AND id = (
               SELECT id FROM work_diary_sessions
               WHERE integration_id = $3 AND ended_at IS NULL
               ORDER BY started_at DESC LIMIT 1
             )`,
          [files.length, [msg.slice(0, 120)], integrationId],
        );
      }
    }
  } catch (err) {
    // Non-fatal — diary session errors don't fail the webhook
    console.warn("[work-diary] session update error:", err);
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const rawBody   = await req.text();
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

  // Look up integration by repo name
  const intRes = await fetch(
    `${MARKETPLACE}/integrations/by-external-id?external_id=${encodeURIComponent(externalId)}`,
  ).catch(() => null);

  if (!intRes?.ok) {
    return NextResponse.json({ ok: true });
  }

  const integration = await intRes.json().catch(() => null) as {
    id?: string;
    connected_by?: string;
    owner_profile_id?: string;
  } | null;

  if (!integration?.id) return NextResponse.json({ ok: true });

  // Store the event (existing behaviour)
  await fetch(`${MARKETPLACE}/integrations/events`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ integration_id: integration.id, event_type: event, title }),
  }).catch(() => null);

  // Work diary: process [START]/[END] commits on push events
  if (event === "push") {
    const commits = (payload.commits as GithubCommit[] | undefined) ?? [];
    const ownerProfileId = integration.owner_profile_id ?? integration.connected_by;
    if (ownerProfileId && commits.length > 0) {
      await handleWorkDiarySessions(integration.id, ownerProfileId, commits);
    }
  }

  return NextResponse.json({ ok: true });
}
