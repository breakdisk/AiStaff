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
       l.id,
       l.jurisdiction,
       l.seats,
       l.issued_at,
       l.expires_at,
       l.revoked_at,
       al.name AS listing_name,
       al.slug
     FROM licenses l
     JOIN agent_listings al ON al.id = l.agent_id
    WHERE l.licensee_id = $1
    ORDER BY l.issued_at DESC`,
    [profileId],
  );

  return NextResponse.json(rows);
}
