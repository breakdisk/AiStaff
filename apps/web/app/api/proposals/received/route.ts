export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface ReceivedProposal {
  id:                  string;
  job_title:           string;
  cover_letter:        string;
  technical_approach:  string;
  proposed_timeline:   string;
  proposed_budget:     string;
  key_deliverables:    string[];
  why_me:              string;
  freelancer_email:    string;
  freelancer_id:       string | null;
  status:              string;
  submitted_at:        string;
  accepted_at:         string | null;
  rejected_at:         string | null;
  job_listing_id:      string | null;
  identity_tier:       number;
  trust_score:         number;
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT
         p.id,
         p.job_title,
         p.cover_letter,
         p.technical_approach,
         p.proposed_timeline,
         p.proposed_budget,
         p.key_deliverables,
         p.why_me,
         p.freelancer_email,
         p.freelancer_id,
         p.status,
         p.submitted_at,
         p.accepted_at,
         p.rejected_at,
         p.job_listing_id,
         COALESCE(up.identity_tier, 0) AS identity_tier,
         COALESCE(up.trust_score,    0) AS trust_score
       FROM proposals p
       LEFT JOIN unified_profiles up ON up.id = p.freelancer_id
       WHERE p.client_email = $1
         AND p.status != 'DRAFT'
       ORDER BY p.submitted_at DESC
       LIMIT 100`,
      [email],
    );

    const result: ReceivedProposal[] = rows.map(r => ({
      id:                 r.id,
      job_title:          r.job_title,
      cover_letter:       r.cover_letter,
      technical_approach: r.technical_approach,
      proposed_timeline:  r.proposed_timeline,
      proposed_budget:    r.proposed_budget,
      key_deliverables:   Array.isArray(r.key_deliverables) ? r.key_deliverables : [],
      why_me:             r.why_me,
      freelancer_email:   r.freelancer_email,
      freelancer_id:      r.freelancer_id,
      status:             r.status,
      submitted_at:       r.submitted_at instanceof Date ? r.submitted_at.toISOString() : String(r.submitted_at),
      accepted_at:        r.accepted_at ? (r.accepted_at instanceof Date ? r.accepted_at.toISOString() : String(r.accepted_at)) : null,
      rejected_at:        r.rejected_at ? (r.rejected_at instanceof Date ? r.rejected_at.toISOString() : String(r.rejected_at)) : null,
      job_listing_id:     r.job_listing_id,
      identity_tier:      Number(r.identity_tier),
      trust_score:        Number(r.trust_score),
    }));

    return NextResponse.json(result);
  } finally {
    client.release();
  }
}
