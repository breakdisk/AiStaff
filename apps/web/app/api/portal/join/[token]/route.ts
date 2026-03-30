export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { jwtVerify } from "jose";
import { createHash } from "crypto";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

type Params = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await params;
  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "dev-secret");

  let payload: { type?: string; org_id?: string; email?: string };
  try {
    const result = await jwtVerify(token, secret);
    payload = result.payload as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid or expired invite link" }, { status: 400 });
  }

  if (payload.type !== "client_invite" || !payload.org_id) {
    return NextResponse.json({ error: "Invalid invite type" }, { status: 400 });
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `UPDATE org_client_links
          SET client_id = $1, accepted_at = NOW()
        WHERE token_hash = $2 AND accepted_at IS NULL
        RETURNING org_id`,
      [profileId, tokenHash],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Invite already used or not found" }, { status: 409 });
    }

    // Return the org handle for redirect
    const { rows: orgs } = await client.query(
      `SELECT handle FROM organisations WHERE id = $1`,
      [payload.org_id],
    );

    return NextResponse.json({ org_handle: orgs[0]?.handle ?? null });
  } finally {
    client.release();
  }
}
