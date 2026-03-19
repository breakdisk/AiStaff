export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

const DEFAULTS = {
  profile_public:    true,
  show_bio:          true,
  show_rate:         true,
  show_skills:       true,
  show_trust_score:  true,
  show_availability: true,
};

const FIELDS = [
  "profile_public",
  "show_bio",
  "show_rate",
  "show_skills",
  "show_trust_score",
  "show_availability",
] as const;

type PrivacyField = typeof FIELDS[number];

export async function GET() {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT profile_public, show_bio, show_rate, show_skills, show_trust_score, show_availability
       FROM profile_privacy WHERE profile_id = $1`,
      [profileId],
    );
    return NextResponse.json(result.rows[0] ?? DEFAULTS);
  } finally {
    client?.release();
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as Record<string, unknown>;

  for (const field of FIELDS) {
    if (field in body && typeof body[field] !== "boolean") {
      return NextResponse.json(
        { error: `${field} must be a boolean` },
        { status: 400 },
      );
    }
  }

  // null = unspecified → COALESCE keeps existing DB value
  const get = (f: PrivacyField): boolean | null =>
    f in body ? (body[f] as boolean) : null;

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `INSERT INTO profile_privacy
         (profile_id, profile_public, show_bio, show_rate, show_skills, show_trust_score, show_availability, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (profile_id) DO UPDATE SET
         profile_public    = COALESCE(EXCLUDED.profile_public,    profile_privacy.profile_public),
         show_bio          = COALESCE(EXCLUDED.show_bio,          profile_privacy.show_bio),
         show_rate         = COALESCE(EXCLUDED.show_rate,         profile_privacy.show_rate),
         show_skills       = COALESCE(EXCLUDED.show_skills,       profile_privacy.show_skills),
         show_trust_score  = COALESCE(EXCLUDED.show_trust_score,  profile_privacy.show_trust_score),
         show_availability = COALESCE(EXCLUDED.show_availability, profile_privacy.show_availability),
         updated_at        = NOW()
       RETURNING profile_public, show_bio, show_rate, show_skills, show_trust_score, show_availability`,
      [
        profileId,
        get("profile_public"),
        get("show_bio"),
        get("show_rate"),
        get("show_skills"),
        get("show_trust_score"),
        get("show_availability"),
      ],
    );
    return NextResponse.json(result.rows[0]);
  } finally {
    client?.release();
  }
}
