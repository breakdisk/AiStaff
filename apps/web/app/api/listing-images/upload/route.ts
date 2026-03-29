import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join }             from "path";
import { randomUUID }       from "crypto";
import sharp                from "sharp";

// Default: /tmp (always writable, no volume config needed).
// Set LISTING_IMAGES_DIR in Dokploy env for persistence across restarts.
const UPLOAD_DIR      = process.env.LISTING_IMAGES_DIR ?? "/tmp/listing-images";
const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB raw upload cap
const MAX_DIMENSION   = 1280;             // px — longest side; maintains aspect ratio
const JPEG_QUALITY    = 82;              // good balance: sharp detail, small file

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file field in form data" }, { status: 400 });

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are accepted" }, { status: 415 });
  }

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_INPUT_BYTES) {
    return NextResponse.json({ error: "File exceeds 10 MB limit" }, { status: 413 });
  }

  let processed: Buffer;
  try {
    processed = await sharp(Buffer.from(bytes))
      .rotate()                        // auto-rotate via EXIF (important for mobile uploads)
      .resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit:              "inside",    // preserve aspect ratio, fit within 1280×1280
        withoutEnlargement: true,      // never upscale — small images stay small
      })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "Image processing failed — unsupported format?" }, { status: 422 });
  }

  const filename = `${randomUUID()}.jpg`;
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(join(UPLOAD_DIR, filename), processed);
  } catch {
    return NextResponse.json({ error: "Storage write failed" }, { status: 500 });
  }

  return NextResponse.json(
    { url: `/api/listing-images/${filename}` },
    { status: 201 },
  );
}
