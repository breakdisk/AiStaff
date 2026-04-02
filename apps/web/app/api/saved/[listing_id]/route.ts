export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ listing_id: string }> },
) {
  const session = await auth();
  const profileId = session?.user?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listing_id } = await params;
  await pool.query(
    `INSERT INTO saved_listings (profile_id, listing_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [profileId, listing_id],
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ listing_id: string }> },
) {
  const session = await auth();
  const profileId = session?.user?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listing_id } = await params;
  await pool.query(
    `DELETE FROM saved_listings WHERE profile_id = $1 AND listing_id = $2`,
    [profileId, listing_id],
  );
  return NextResponse.json({ ok: true });
}
