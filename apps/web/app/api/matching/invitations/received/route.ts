export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  const talentId = (session?.user as { profileId?: string })?.profileId;
  if (!talentId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT
         mi.id,
         mi.client_id,
         mi.listing_id,
         mi.message,
         mi.status,
         mi.created_at,
         mi.responded_at,
         COALESCE(up.display_name, '') AS client_name,
         COALESCE(al.name,          '') AS listing_title
         FROM match_invitations mi
         LEFT JOIN unified_profiles up ON up.id = mi.client_id
         LEFT JOIN agent_listings   al ON al.id = mi.listing_id
        WHERE mi.talent_id = $1
        ORDER BY mi.created_at DESC
        LIMIT 50`,
      [talentId],
    );
    return NextResponse.json({ invitations: result.rows });
  } catch (err) {
    console.error("[GET /api/matching/invitations/received]", err);
    return NextResponse.json({ invitations: [] }, { status: 500 });
  } finally {
    client?.release();
  }
}
