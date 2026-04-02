export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { status?: string };
  const { status } = body;

  if (!status || !["ACCEPTED", "REJECTED"].includes(status)) {
    return NextResponse.json({ error: "status must be ACCEPTED or REJECTED" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const { rowCount } = await client.query(
      `UPDATE proposals
          SET status      = $1,
              accepted_at = CASE WHEN $1 = 'ACCEPTED' THEN NOW() ELSE accepted_at END,
              rejected_at = CASE WHEN $1 = 'REJECTED' THEN NOW() ELSE rejected_at END
        WHERE id           = $2
          AND client_email = $3
          AND status       = 'PENDING'`,
      [status, id, email],
    );
    if (!rowCount || rowCount === 0) {
      return NextResponse.json({ error: "Proposal not found or already actioned" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } finally {
    client.release();
  }
}
