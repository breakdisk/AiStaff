export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: orgId } = await params;

  // Fetch proposals linked to org members (by email match on freelancer_email or client_email)
  const { rows } = await pool.query<{
    id: string;
    job_title: string;
    freelancer_email: string;
    client_email: string;
    submitted_at: string;
    status: string;
  }>(
    `SELECT
       p.id,
       p.job_title,
       p.freelancer_email,
       p.client_email,
       p.submitted_at,
       p.status
     FROM proposals p
     WHERE p.freelancer_email IN (
       SELECT up.email FROM org_members om
       JOIN unified_profiles up ON up.id = om.profile_id
       WHERE om.org_id = $1
     )
     OR p.client_email IN (
       SELECT up.email FROM org_members om
       JOIN unified_profiles up ON up.id = om.profile_id
       WHERE om.org_id = $1
     )
     ORDER BY p.submitted_at DESC`,
    [orgId],
  );

  const toItem = (r: typeof rows[0]) => ({
    id:                      r.id,
    job_title:               r.job_title,
    freelancer_email:        r.freelancer_email,
    client_email:            r.client_email,
    submitted_at:            r.submitted_at,
    submitted_by_profile_id: null,
    submitter_name:          null,
    status:                  r.status,
  });

  return NextResponse.json({
    draft:  rows.filter((r) => r.status === "DRAFT").map(toItem),
    sent:   rows.filter((r) => r.status === "PENDING").map(toItem),
    closed: rows.filter((r) => r.status === "ACCEPTED" || r.status === "REJECTED").map(toItem),
  });
}
