export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PrivacyRow {
  profile_public: boolean;
  show_bio: boolean;
  show_rate: boolean;
  show_skills: boolean;
  show_trust_score: boolean;
  show_availability: boolean;
}

const PRIVACY_DEFAULTS: PrivacyRow = {
  profile_public: true,
  show_bio: true,
  show_rate: true,
  show_skills: true,
  show_trust_score: true,
  show_availability: true,
};

interface IdentityProfile {
  profile_id: string;
  display_name: string;
  trust_score: number;
  identity_tier: string;
  bio: string | null;
  hourly_rate_cents: number | null;
  availability: string;
  role: string | null;
}

interface SkillEntry {
  tag: string;
  domain: string;
  proficiency: number;
  verified_at: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid UUID" }, { status: 400 });
  }

  let client;
  try {
    client = await pool.connect();

    // 1. Privacy settings (missing row = all defaults)
    const privacyResult = await client.query(
      `SELECT profile_public, show_bio, show_rate, show_skills, show_trust_score, show_availability
       FROM profile_privacy WHERE profile_id = $1`,
      [id],
    );
    const privacy: PrivacyRow = privacyResult.rows[0] ?? PRIVACY_DEFAULTS;

    // 2. Follower count
    const followResult = await client.query(
      `SELECT COUNT(*) AS count FROM talent_follows WHERE following_id = $1`,
      [id],
    );
    const follower_count = parseInt(followResult.rows[0]?.count ?? "0", 10);

    // 3. Fetch profile from identity_service — 404 always wins
    const identityRes = await fetch(
      `${process.env.IDENTITY_SERVICE_URL}/identity/public-profile/${id}`,
    );
    if (identityRes.status === 404) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    if (!identityRes.ok) {
      return NextResponse.json({ error: "Upstream error" }, { status: 500 });
    }
    const profile = await identityRes.json() as IdentityProfile;

    // 4. Hidden profile — return minimal response only
    if (!privacy.profile_public) {
      return NextResponse.json({
        profile_id: profile.profile_id,
        display_name: profile.display_name,
        role: profile.role ?? null,
        hidden: true,
        follower_count,
      });
    }

    // 5. Skills from marketplace_service (non-fatal)
    let skills: Array<{ tag: string; domain: string; proficiency: number; verified: boolean }> = [];
    if (privacy.show_skills) {
      try {
        const skillsRes = await fetch(
          `${process.env.MARKETPLACE_SERVICE_URL}/talent-skills/${id}`,
        );
        if (skillsRes.ok) {
          const data = await skillsRes.json() as { skills: SkillEntry[] };
          skills = (data.skills ?? []).map((s) => ({
            tag: s.tag,
            domain: s.domain,
            proficiency: s.proficiency,
            verified: s.verified_at !== null,
          }));
        }
      } catch {
        // non-fatal — treat as empty
      }
    }

    // 6. Build response applying privacy flags
    const response: Record<string, unknown> = {
      profile_id: profile.profile_id,
      display_name: profile.display_name,
      role: profile.role ?? null,
      hidden: false,
      follower_count,
    };
    if (privacy.show_bio)          response.bio = profile.bio;
    if (privacy.show_rate)         response.hourly_rate_cents = profile.hourly_rate_cents;
    if (privacy.show_availability) response.availability = profile.availability;
    if (privacy.show_trust_score) {
      response.trust_score = profile.trust_score;
      response.identity_tier = profile.identity_tier;
    }
    if (privacy.show_skills) response.skills = skills;

    return NextResponse.json(response);
  } catch (err) {
    console.error("[api/talent/[id]]", err);
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  } finally {
    client?.release();
  }
}
