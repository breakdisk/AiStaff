export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(req: NextRequest) {
  const listingId = req.nextUrl.searchParams.get("listing_id");
  if (!listingId) return NextResponse.json({ error: "listing_id required" }, { status: 400 });

  const { rows } = await pool.query(
    `SELECT
       dr.id,
       LEFT(up.email, 1) AS reviewer_initial,
       dr.rating,
       dr.body,
       dr.created_at
     FROM deployment_reviews dr
     JOIN unified_profiles up ON up.id = dr.reviewer_id
    WHERE dr.listing_id = $1
    ORDER BY dr.created_at DESC
    LIMIT 50`,
    [listingId],
  );

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const profileId = session?.user?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    deployment_id: string;
    listing_id: string;
    rating: number;
    body?: string;
  };

  if (!body.deployment_id || !body.listing_id || !body.rating) {
    return NextResponse.json({ error: "deployment_id, listing_id, rating required" }, { status: 400 });
  }
  if (body.rating < 1 || body.rating > 5) {
    return NextResponse.json({ error: "rating must be 1–5" }, { status: 400 });
  }

  try {
    await pool.query(
      `INSERT INTO deployment_reviews (deployment_id, listing_id, reviewer_id, rating, body)
       VALUES ($1, $2, $3, $4, $5)`,
      [body.deployment_id, body.listing_id, profileId, body.rating, body.body ?? null],
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err: unknown) {
    const pg = err as { code?: string };
    if (pg.code === "23505") {
      return NextResponse.json({ error: "Already reviewed" }, { status: 409 });
    }
    throw err;
  }
}
