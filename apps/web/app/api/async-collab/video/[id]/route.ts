import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { readFile } from "fs/promises";
import { join } from "path";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const UPLOAD_DIR = process.env.ASYNC_COLLAB_UPLOAD_DIR ?? "/tmp/async-collab";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const client = await pool.connect();
  let videoPath: string | null = null;
  try {
    const { rows } = await client.query(
      "SELECT video_path FROM async_updates WHERE id = $1",
      [id],
    );
    if (!rows.length || !rows[0].video_path) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    videoPath = rows[0].video_path as string;
  } finally {
    client.release();
  }

  try {
    const buf = await readFile(join(UPLOAD_DIR, videoPath));
    const contentType = videoPath.endsWith(".mp4") ? "video/mp4" : "video/webm";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buf.length),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
  }
}

// Mark as viewed
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { viewer_id } = await req.json() as { viewer_id: string };
  if (!viewer_id) return new NextResponse(null, { status: 204 });

  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO async_update_views (update_id, viewer_id)
       VALUES ($1, $2)
       ON CONFLICT (update_id, viewer_id) DO NOTHING`,
      [id, viewer_id],
    );
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  } finally {
    client.release();
  }
}
