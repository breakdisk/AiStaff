export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

const VALID_DOMAINS = [
  "systems", "web", "mobile", "ai", "data",
  "infra", "security", "web3", "cloud", "general",
] as const;

const TAG_RE = /^[a-z0-9][a-z0-9\-]{0,38}[a-z0-9]$|^[a-z0-9]{1,2}$/;

export async function POST(req: NextRequest) {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { tag?: unknown; domain?: unknown };
  const tag    = typeof body.tag    === "string" ? body.tag.trim().toLowerCase()    : "";
  const domain = typeof body.domain === "string" ? body.domain.trim().toLowerCase() : "";

  if (!TAG_RE.test(tag)) {
    return NextResponse.json(
      { error: "Tag must be 1–40 chars, lowercase alphanumeric and hyphens only" },
      { status: 400 },
    );
  }
  if (!(VALID_DOMAINS as readonly string[]).includes(domain)) {
    return NextResponse.json(
      { error: `domain must be one of: ${VALID_DOMAINS.join(", ")}` },
      { status: 400 },
    );
  }

  let client;
  try {
    client = await pool.connect();

    const existing = await client.query(
      `SELECT id FROM skill_tags WHERE tag = $1`,
      [tag],
    );
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: "This skill already exists in the taxonomy" },
        { status: 409 },
      );
    }

    const result = await client.query(
      `INSERT INTO skill_suggestions (tag, domain, suggested_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (tag) DO UPDATE SET tag = EXCLUDED.tag
       RETURNING id, tag, domain, status`,
      [tag, domain, profileId],
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (err) {
    console.error("[api/skill-suggestions POST]", err);
    return NextResponse.json({ error: "Failed to submit suggestion" }, { status: 500 });
  } finally {
    client?.release();
  }
}
