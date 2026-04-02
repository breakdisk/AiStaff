export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: orgId } = await params;
  const deploymentId = req.nextUrl.searchParams.get("deployment_id");

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT st.id, st.deployment_id, st.title, st.description, st.budget_cents,
              st.status, st.created_at, st.updated_at,
              f.full_name AS freelancer_name, f.email AS freelancer_email
         FROM subcontract_tasks st
         LEFT JOIN unified_profiles f ON f.id = st.freelancer_id
        WHERE st.org_id = $1
          AND ($2::uuid IS NULL OR st.deployment_id = $2::uuid)
        ORDER BY st.created_at DESC`,
      [orgId, deploymentId ?? null],
    );
    return NextResponse.json({ tasks: rows });
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: orgId } = await params;
  const body = await req.json() as {
    deployment_id: string;
    title: string;
    description?: string;
    budget_cents: number;
  };

  if (!body.deployment_id || !body.title || !body.budget_cents) {
    return NextResponse.json({ error: "deployment_id, title, and budget_cents are required" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO subcontract_tasks (deployment_id, org_id, title, description, budget_cents)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [body.deployment_id, orgId, body.title, body.description ?? null, body.budget_cents],
    );
    return NextResponse.json({ task: rows[0] }, { status: 201 });
  } finally {
    client.release();
  }
}
