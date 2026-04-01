export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface PayoutRequest {
  id:          string;
  amount_cents: number;
  bank_ref:    string | null;
  note:        string | null;
  status:      string;
  created_at:  string;
  reviewed_at: string | null;
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, amount_cents, bank_ref, note, status, created_at, reviewed_at
         FROM payout_requests
        WHERE profile_id = $1
        ORDER BY created_at DESC
        LIMIT 20`,
      [profileId],
    );

    const result: PayoutRequest[] = rows.map(r => ({
      id:           r.id,
      amount_cents: Number(r.amount_cents),
      bank_ref:     r.bank_ref,
      note:         r.note,
      status:       r.status,
      created_at:   r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      reviewed_at:  r.reviewed_at ? (r.reviewed_at instanceof Date ? r.reviewed_at.toISOString() : String(r.reviewed_at)) : null,
    }));

    return NextResponse.json(result);
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { amount_cents?: number; bank_ref?: string; note?: string };
  const { amount_cents, bank_ref, note } = body;

  if (!amount_cents || amount_cents <= 0) {
    return NextResponse.json({ error: "amount_cents must be a positive integer" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    // Enforce one pending request at a time
    const { rows: pending } = await client.query(
      `SELECT id FROM payout_requests WHERE profile_id = $1 AND status = 'PENDING' LIMIT 1`,
      [profileId],
    );
    if (pending.length > 0) {
      return NextResponse.json(
        { error: "You already have a pending payout request. Wait for it to be processed." },
        { status: 409 },
      );
    }

    const { rows } = await client.query(
      `INSERT INTO payout_requests (profile_id, amount_cents, bank_ref, note)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [profileId, amount_cents, bank_ref ?? null, note ?? null],
    );

    return NextResponse.json({ id: rows[0].id }, { status: 201 });
  } finally {
    client.release();
  }
}
