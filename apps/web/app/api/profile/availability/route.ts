export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface AvailabilityBlock {
  date:   string; // YYYY-MM-DD
  status: "AVAILABLE" | "BUSY" | "TENTATIVE";
}

// GET — returns the current user's availability for the next 28 days
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT TO_CHAR(block_date, 'YYYY-MM-DD') AS date, status
         FROM availability_blocks
        WHERE profile_id = $1
          AND block_date >= CURRENT_DATE
          AND block_date <  CURRENT_DATE + INTERVAL '28 days'
        ORDER BY block_date`,
      [profileId],
    );
    return NextResponse.json(rows as AvailabilityBlock[]);
  } finally {
    client.release();
  }
}

// PATCH — upsert a single day's status (or delete if status is null)
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { date: string; status: string | null };
  const { date, status } = body;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    if (!status) {
      // Clear the block (defaults to AVAILABLE implicitly)
      await client.query(
        `DELETE FROM availability_blocks WHERE profile_id = $1 AND block_date = $2`,
        [profileId, date],
      );
    } else {
      const valid = ["AVAILABLE", "BUSY", "TENTATIVE"];
      if (!valid.includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      await client.query(
        `INSERT INTO availability_blocks (profile_id, block_date, status)
         VALUES ($1, $2, $3)
         ON CONFLICT (profile_id, block_date) DO UPDATE SET status = EXCLUDED.status`,
        [profileId, date, status],
      );
    }
    return NextResponse.json({ ok: true });
  } finally {
    client.release();
  }
}
