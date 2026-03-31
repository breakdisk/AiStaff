export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface JobRow {
  id:              string;
  name:            string;
  description:     string | null;
  price_cents:     number;
  category:        string | null;
  seller_type:     string | null;
  created_at:      string;
  poster_email:    string | null;
  required_skills: string[];
  proposal_count:  number;
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await pool.connect();
  try {
    const { rows } = await client.query<JobRow>(
      `SELECT
         al.id,
         al.name,
         al.description,
         al.price_cents,
         al.category,
         al.seller_type,
         al.created_at,
         up.email    AS poster_email,
         COALESCE(
           (SELECT ARRAY_AGG(st.tag)
              FROM agent_required_skills ars
              JOIN skill_tags st ON st.id = ars.skill_tag_id
             WHERE ars.listing_id = al.id),
           '{}'::text[]
         )           AS required_skills,
         (SELECT COUNT(*) FROM proposals p WHERE p.job_listing_id = al.id)::INT AS proposal_count
       FROM agent_listings al
       JOIN unified_profiles up ON up.id = al.developer_id
      WHERE al.category    = 'AiTalent'
        AND al.seller_type = 'Freelancer'
        AND al.listing_status IS DISTINCT FROM 'ARCHIVED'
      ORDER BY al.created_at DESC
      LIMIT 50`,
      [],
    );
    return NextResponse.json(rows);
  } finally {
    client.release();
  }
}
