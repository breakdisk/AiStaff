export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: listingId } = await params;
  if (!UUID_RE.test(listingId)) {
    return NextResponse.json({ error: "Invalid listing ID" }, { status: 400 });
  }

  const body = await req.json() as { tag_ids?: unknown };
  const tagIds = body.tag_ids;

  if (!Array.isArray(tagIds)) {
    return NextResponse.json({ error: "tag_ids must be an array" }, { status: 400 });
  }
  for (const id of tagIds) {
    if (typeof id !== "string" || !UUID_RE.test(id)) {
      return NextResponse.json({ error: "Each tag_id must be a valid UUID" }, { status: 400 });
    }
  }

  let client;
  try {
    client = await pool.connect();

    const listingCheck = await client.query(
      `SELECT id FROM agent_listings WHERE id = $1 AND developer_id = $2`,
      [listingId, profileId],
    );
    if (listingCheck.rows.length === 0) {
      return NextResponse.json({ error: "Listing not found or not yours" }, { status: 404 });
    }

    await client.query("BEGIN");
    await client.query(
      `DELETE FROM agent_required_skills WHERE listing_id = $1`,
      [listingId],
    );
    if (tagIds.length > 0) {
      const values = tagIds
        .map((_, i) => `($1, $${i + 2})`)
        .join(", ");
      await client.query(
        `INSERT INTO agent_required_skills (listing_id, tag_id) VALUES ${values}
         ON CONFLICT DO NOTHING`,
        [listingId, ...tagIds],
      );
    }
    await client.query("COMMIT");

    return NextResponse.json({ ok: true, stored: tagIds.length });
  } catch (err) {
    await client?.query("ROLLBACK").catch(() => {});
    console.error("[api/listings/[id]/required-skills]", err);
    return NextResponse.json({ error: "Failed to store required skills" }, { status: 500 });
  } finally {
    client?.release();
  }
}
