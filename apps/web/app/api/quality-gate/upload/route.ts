export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";
const MAX_CONTENT_BYTES = 100_000; // 100 KB — truncate before sending to Claude

// ── Scan type from file extension ─────────────────────────────────────────────

function detectScanType(filename: string): "code" | "security" | "plagiarism" | "text" {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["py", "rs", "ts", "js", "tsx", "jsx", "go", "java", "rb", "php", "cpp", "c", "cs"].includes(ext))
    return "code";
  if (["env", "yml", "yaml", "toml", "json", "sh", "bash"].includes(ext))
    return "security";
  if (["md", "txt", "rst"].includes(ext))
    return "plagiarism";
  return "text";
}

// ── Claude scan ────────────────────────────────────────────────────────────────

interface ScanResult {
  score: number;
  blocks_release: boolean;
  issues: Array<{
    severity: "critical" | "high" | "medium" | "low" | "info";
    category: string;
    message: string;
    location: string;
    suggestion: string;
  }>;
}

async function runClaudeScan(filename: string, scanType: string, content: string): Promise<ScanResult> {
  const model = new ChatAnthropic({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 2048,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const prompt = `You are a code quality and security analysis agent. Analyse the deliverable below and return ONLY valid JSON — no markdown, no explanation, just the JSON object.

Schema:
{
  "score": <integer 0-100>,
  "blocks_release": <boolean — true if any critical or high severity issues found>,
  "issues": [
    {
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "category": <string e.g. "Security" | "Bug" | "Quality" | "Style" | "Plagiarism">,
      "message": <string — concise description of the issue>,
      "location": <string — file:line or section description>,
      "suggestion": <string — specific actionable fix>
    }
  ]
}

Scoring guide:
- 90-100: excellent, no meaningful issues
- 70-89: good, minor or info-only issues
- 50-69: flagged, medium+ issues present
- below 50: critical issues, must block release

File: ${filename}
Type: ${scanType}

Content:
${content}`;

  try {
    const response = await model.invoke([new HumanMessage(prompt)]);
    const raw = response.content;
    const text = typeof raw === "string"
      ? raw
      : (raw as Array<{ text?: string }>).map(c => c.text ?? "").join("");

    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    return JSON.parse(cleaned) as ScanResult;
  } catch {
    // AI failed — treat as critical blocker so nothing slips through silently
    return {
      score: 0,
      blocks_release: true,
      issues: [{
        severity: "critical",
        category: "Analysis Error",
        message: "AI quality scan failed to produce a parseable result",
        location: filename,
        suggestion: "Re-upload the file to retry the scan, or manually review the deliverable.",
      }],
    };
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ error: "No profile" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const deploymentId = formData.get("deployment_id") as string | null;
  const milestone    = (formData.get("milestone") as string | null) ?? "";

  // Read file content — truncate at 100KB to stay within Claude context limits
  const buffer    = await file.arrayBuffer();
  const truncated = buffer.byteLength > MAX_CONTENT_BYTES
    ? buffer.slice(0, MAX_CONTENT_BYTES)
    : buffer;
  const content   = new TextDecoder("utf-8", { fatal: false }).decode(truncated);

  const scanType = detectScanType(file.name);
  const startMs  = Date.now();

  // Step 1 — Create pending scan record in DB
  const createRes = await fetch(`${MARKETPLACE}/quality-gate/scans`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Profile-Id": profileId },
    body: JSON.stringify({
      deployment_id:   deploymentId ?? null,
      uploaded_by:     profileId,
      file_name:       file.name,
      file_size_bytes: file.size,
      scan_type:       scanType,
      milestone,
    }),
  }).catch(() => null);

  if (!createRes?.ok) {
    return NextResponse.json({ error: "Failed to create scan record" }, { status: 500 });
  }

  const { scan_id } = await createRes.json() as { scan_id: string };

  // Step 2 — Set status to scanning
  await fetch(`${MARKETPLACE}/quality-gate/scans/${scan_id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Profile-Id": profileId },
    body: JSON.stringify({ status: "scanning", score: null, blocks_release: false, duration_ms: null }),
  }).catch(() => null);

  // Step 3 — Run Claude analysis
  const result      = await runClaudeScan(file.name, scanType, content);
  const duration_ms = Date.now() - startMs;
  const status      = result.issues.some(i => i.severity === "critical" || i.severity === "high")
    ? "flagged"
    : "passed";

  // Step 4 — Persist status + score
  await fetch(`${MARKETPLACE}/quality-gate/scans/${scan_id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Profile-Id": profileId },
    body: JSON.stringify({
      status,
      score:         result.score,
      blocks_release: result.blocks_release,
      duration_ms,
    }),
  }).catch(() => null);

  // Step 5 — Persist issues
  if (result.issues.length > 0) {
    await fetch(`${MARKETPLACE}/quality-gate/scans/${scan_id}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Profile-Id": profileId },
      body: JSON.stringify({ issues: result.issues }),
    }).catch(() => null);
  }

  return NextResponse.json({
    scan_id,
    file_name:     file.name,
    scan_type:     scanType,
    status,
    score:         result.score,
    blocks_release: result.blocks_release,
    duration_ms,
    issues:        result.issues,
  });
}
