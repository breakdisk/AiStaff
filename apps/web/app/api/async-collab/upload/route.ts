import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const UPLOAD_DIR = process.env.ASYNC_COLLAB_UPLOAD_DIR ?? "/tmp/async-collab";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const authorName = (session.user as { name?: string }).name ?? "Anonymous";

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const title       = (form.get("title") as string | null)?.trim() || "Untitled update";
  const tagsRaw     = (form.get("tags")  as string | null) ?? "";
  const durationStr = (form.get("duration_s") as string | null) ?? "0";
  const deploymentId = form.get("deployment_id") as string | null;
  const duration    = Math.max(0, parseInt(durationStr, 10) || 0);
  const tags        = tagsRaw.split(",").map(t => t.trim()).filter(Boolean);
  const videoFile   = form.get("video") as File | null;

  let videoPath: string | null = null;
  if (videoFile && videoFile.size > 0) {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const ext      = videoFile.name.endsWith(".mp4") ? "mp4" : "webm";
    const filename = `${randomUUID()}.${ext}`;
    const bytes    = await videoFile.arrayBuffer();
    await writeFile(join(UPLOAD_DIR, filename), Buffer.from(bytes));
    videoPath = filename;
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO async_updates
         (deployment_id, author_id, author_name, title, video_path, duration_s, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [deploymentId || null, profileId, authorName, title, videoPath, duration, tags],
    );
    return NextResponse.json({ id: rows[0].id });
  } finally {
    client.release();
  }
}
