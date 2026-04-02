export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { SignJWT } from "jose";
import { createHash } from "crypto";
import { sendEmail } from "@/lib/mailer";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: orgId } = await params;
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT cl.id, cl.invited_email, cl.accepted_at, cl.created_at,
              p.full_name AS client_name, p.email AS client_email,
              p.identity_tier, p.trust_score
         FROM org_client_links cl
         LEFT JOIN unified_profiles p ON p.id = cl.client_id
        WHERE cl.org_id = $1
        ORDER BY cl.created_at DESC`,
      [orgId],
    );
    return NextResponse.json({ links: rows });
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: orgId } = await params;
  const { email } = await req.json() as { email: string };

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    // Get org details for the email
    const { rows: orgs } = await client.query(
      `SELECT name, handle FROM organisations WHERE id = $1`,
      [orgId],
    );
    if (orgs.length === 0) {
      return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
    }
    const org = orgs[0];

    const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "dev-secret");
    const token = await new SignJWT({ type: "client_invite", org_id: orgId, email })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(secret);

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const base = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "https://aistaffglobal.com";
    const inviteUrl = `${base}/portal/join/${token}`;

    await client.query(
      `INSERT INTO org_client_links (org_id, invited_email, token_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (token_hash) DO NOTHING`,
      [orgId, email, tokenHash],
    );

    await sendEmail(
      email,
      `${org.name} invited you to AiStaff`,
      `You've been invited to join ${org.name}'s client portal on AiStaff.\n\n` +
      `Click the link below to get started (expires in 7 days):\n\n${inviteUrl}\n\n` +
      `AiStaff — AI Agent, Talent & Robotics Marketplace\nhttps://aistaffglobal.com`,
    );

    return NextResponse.json({ invite_url: inviteUrl }, { status: 201 });
  } finally {
    client.release();
  }
}
