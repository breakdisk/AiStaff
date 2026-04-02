export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET() {
  const session = await auth();
  const profileId = session?.user?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await pool.query(
    `SELECT
       sl.listing_id,
       al.name,
       al.description,
       al.price_cents,
       al.category,
       al.slug,
       sl.saved_at
     FROM saved_listings sl
     JOIN agent_listings al ON al.id = sl.listing_id
    WHERE sl.profile_id = $1
    ORDER BY sl.saved_at DESC`,
    [profileId],
  );

  return NextResponse.json(rows);
}
