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

// GET /api/talent/[id]/follow
// Public: returns follower_count.
// Authenticated: also returns whether the session user follows this profile.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid UUID" }, { status: 400 });
  }

  const session = await auth();
  const followerId = (session?.user as { profileId?: string })?.profileId;

  let client;
  try {
    client = await pool.connect();
    const countResult = await client.query(
      `SELECT COUNT(*) AS count FROM talent_follows WHERE following_id = $1`,
      [id],
    );
    const follower_count = parseInt(countResult.rows[0]?.count ?? "0", 10);

    let following = false;
    if (followerId && followerId !== id) {
      const followCheck = await client.query(
        `SELECT 1 FROM talent_follows WHERE follower_id = $1 AND following_id = $2`,
        [followerId, id],
      );
      following = followCheck.rows.length > 0;
    }

    return NextResponse.json({ follower_count, following });
  } finally {
    client?.release();
  }
}

// POST /api/talent/[id]/follow
// Toggles follow/unfollow. Returns { following: boolean, follower_count: number }.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid UUID" }, { status: 400 });
  }

  const session = await auth();
  const followerId = (session?.user as { profileId?: string })?.profileId;
  if (!followerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (followerId === id) {
    return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
  }

  let client;
  try {
    client = await pool.connect();

    const existingCheck = await client.query(
      `SELECT 1 FROM talent_follows WHERE follower_id = $1 AND following_id = $2`,
      [followerId, id],
    );
    const wasFollowing = existingCheck.rows.length > 0;

    if (wasFollowing) {
      await client.query(
        `DELETE FROM talent_follows WHERE follower_id = $1 AND following_id = $2`,
        [followerId, id],
      );
    } else {
      await client.query(
        `INSERT INTO talent_follows (follower_id, following_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [followerId, id],
      );
    }

    const countResult = await client.query(
      `SELECT COUNT(*) AS count FROM talent_follows WHERE following_id = $1`,
      [id],
    );
    const follower_count = parseInt(countResult.rows[0]?.count ?? "0", 10);

    return NextResponse.json({ following: !wasFollowing, follower_count });
  } finally {
    client?.release();
  }
}
