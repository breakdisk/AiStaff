import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join }     from "path";

const UPLOAD_DIR = process.env.LISTING_IMAGES_DIR ?? "/tmp/listing-images";

// Strict allowlist: UUID v4 filename + .jpg only — prevents path traversal.
const SAFE_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!SAFE_FILENAME.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const buf = await readFile(join(UPLOAD_DIR, id));
    return new NextResponse(buf, {
      headers: {
        "Content-Type":  "image/jpeg",
        "Content-Length": String(buf.length),
        // Immutable: filename is a UUID — content never changes after write.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
