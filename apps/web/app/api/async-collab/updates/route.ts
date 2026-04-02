import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ updates: [] });

  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ updates: [] });

  const { searchParams } = new URL(req.url);
  const deploymentId = searchParams.get("deployment_id");

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT au.id, au.deployment_id, au.author_id, au.author_name,
              au.title, au.video_path, au.duration_s, au.ai_summary,
              au.tags, au.created_at,
              EXISTS(
                SELECT 1 FROM async_update_views auv
                WHERE auv.update_id = au.id AND auv.viewer_id = $1
              ) AS viewed
       FROM async_updates au
       WHERE ($2::uuid IS NULL OR au.deployment_id = $2::uuid)
       ORDER BY au.created_at DESC
       LIMIT 50`,
      [profileId, deploymentId || null],
    );
    return NextResponse.json({ updates: rows });
  } catch {
    // Table may not exist yet — return empty gracefully
    return NextResponse.json({ updates: [] });
  } finally {
    client.release();
  }
}
