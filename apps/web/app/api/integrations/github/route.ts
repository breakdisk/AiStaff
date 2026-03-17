import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";
const WEBHOOK_BASE = process.env.AUTH_URL ?? "http://localhost:3000";
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? "";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { deployment_id, repo_url } = await req.json() as { deployment_id: string; repo_url: string };

  // Parse owner/repo from URL: https://github.com/owner/repo
  const match = repo_url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return NextResponse.json({ error: "Invalid GitHub repo URL" }, { status: 400 });

  const owner = match[1];
  const repo  = match[2].replace(/\.git$/, "");
  const repoFullName = `${owner}/${repo}`;

  const githubToken = (session.user as { githubAccessToken?: string }).githubAccessToken;
  if (!githubToken) {
    return NextResponse.json(
      { error: "No GitHub token — please sign in with GitHub to connect repos" },
      { status: 403 },
    );
  }

  const profileId = (session.user as { profileId?: string }).profileId ?? "";

  // Register webhook on GitHub
  const webhookUrl = `${WEBHOOK_BASE}/api/webhooks/github`;
  const ghRes = await fetch(`https://api.github.com/repos/${repoFullName}/hooks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      "Content-Type": "application/json",
      "User-Agent": "AiStaffApp",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({
      name: "web",
      active: true,
      events: ["push", "pull_request"],
      config: {
        url: webhookUrl,
        content_type: "json",
        secret: GITHUB_WEBHOOK_SECRET,
      },
    }),
  }).catch(() => null);

  if (!ghRes) return NextResponse.json({ error: "Failed to reach GitHub API" }, { status: 502 });

  if (!ghRes.ok) {
    const errText = await ghRes.text().catch(() => "unknown");
    return NextResponse.json({ error: `GitHub API error: ${errText}` }, { status: ghRes.status });
  }

  const ghData = await ghRes.json() as { id: number };
  const webhookId: number = ghData.id;

  // Persist integration record
  const r = await fetch(`${MARKETPLACE}/integrations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deployment_id,
      provider:      "github",
      name:          repoFullName,
      external_url:  `https://github.com/${repoFullName}`,
      external_id:   repoFullName,
      webhook_id:    webhookId,
      connected_by:  profileId,
    }),
  });

  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
