export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

function jaccard(required: string[], userSkills: Set<string>): number {
  const req = new Set(required.map(s => s.toLowerCase()));
  const intersection = [...req].filter(s => userSkills.has(s)).length;
  const union = new Set([...req, ...userSkills]).size;
  return union === 0 ? 1 : intersection / union;
}

function formatBudget(cents: number): string {
  return "$" + Math.round(cents / 100).toLocaleString("en-US");
}

function maskClient(email: string | null, listingId: string): string {
  if (email) {
    const [local] = email.split("@");
    return local + "@…";
  }
  return "Client " + listingId.slice(0, 6);
}

interface MissedJobRow {
  request_id:      string;
  your_score:      string | number;
  top_score:       string | number;
  created_at:      string;
  listing_id:      string;
  job_title:       string;
  price_cents:     string | number;
  required_skills: string[];
  min_trust_score: string | number;
  client_email:    string | null;
}

interface ProfileRow {
  trust_score:       string | number;
  tier:              string;
  hourly_rate_cents: string | number | null;
  total_deployments: string | number;
}

interface SkillRow {
  tag: string;
}

export async function GET() {
  const session = await auth();
  const profileId = session?.user?.profileId;
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let client;
  try {
    client = await pool.connect();

    // 1. Missed jobs — requests where another talent scored higher
    const { rows: jobs } = await client.query(
      `WITH ranked AS (
        SELECT
          mr.request_id,
          mr.talent_id,
          mr.match_score,
          mr.created_at,
          RANK() OVER (PARTITION BY mr.request_id ORDER BY mr.match_score DESC) AS rank,
          MAX(mr.match_score) OVER (PARTITION BY mr.request_id) AS top_score
        FROM match_results mr
      )
      SELECT
        r.request_id,
        r.match_score          AS your_score,
        r.top_score,
        r.created_at,
        al.id                  AS listing_id,
        al.name                AS job_title,
        al.price_cents,
        mreq.required_skills,
        mreq.min_trust_score,
        dev.email              AS client_email
      FROM ranked r
      JOIN match_requests mreq ON mreq.id = r.request_id
      JOIN agent_listings al   ON al.id = mreq.agent_id
      JOIN unified_profiles dev ON dev.id = al.developer_id
      WHERE r.talent_id = $1 AND r.rank > 1
      ORDER BY r.created_at DESC
      LIMIT 20`,
      [profileId],
    );

    if (jobs.length === 0) {
      return NextResponse.json([]);
    }

    // 2. Profile snapshot for factor computation
    const { rows: profileRows } = await client.query(
      `SELECT
        up.trust_score,
        up.identity_tier::TEXT AS tier,
        up.hourly_rate_cents,
        COALESCE(tr.total_deployments, 0) AS total_deployments
       FROM unified_profiles up
       LEFT JOIN talent_roi tr ON tr.talent_id = up.id
       WHERE up.id = $1`,
      [profileId],
    );
    const profile: ProfileRow = profileRows[0] ?? {
      trust_score:       0,
      tier:              "UNVERIFIED",
      hourly_rate_cents: null,
      total_deployments: "0",
    };

    // 3. Verified skills (proficiency >= 3)
    const { rows: skillRows } = await client.query(
      `SELECT st.tag
       FROM talent_skills ts
       JOIN skill_tags st ON st.id = ts.tag_id
       WHERE ts.talent_id = $1 AND ts.proficiency >= 3`,
      [profileId],
    );
    const userSkills = new Set<string>(
      skillRows.map((r: SkillRow) => r.tag.toLowerCase()),
    );

    const trustScore  = Number(profile.trust_score)       || 0;
    const rateCents   = profile.hourly_rate_cents != null ? Number(profile.hourly_rate_cents) : null;
    const deployments = parseInt(String(profile.total_deployments), 10) || 0;

    const result = jobs.map((job: MissedJobRow) => {
      const required = job.required_skills ?? [];
      const minTrust = Number(job.min_trust_score) || 40;
      const budget   = Number(job.price_cents)     || 0;
      const skillPct = jaccard(required, userSkills);

      // ── Skill factor ───────────────────────────────────────────────────────
      const skillStatus = skillPct >= 0.70 ? "pass" : skillPct >= 0.40 ? "partial" : "fail";
      const missingSkills = required.filter(s => !userSkills.has(s.toLowerCase()));
      const skillFactor = {
        id:        "skill",
        category:  "Skills",
        label:     "Skill Match",
        yourValue: `${Math.round(skillPct * 100)}% (${userSkills.size} tags)`,
        required:  `≥ 70% (${required.join(", ") || "any"})`,
        status:    skillStatus as "pass" | "fail" | "partial",
        weight:    30,
        gap:       skillStatus !== "pass"
          ? missingSkills.length > 0
            ? `Missing: ${missingSkills.slice(0, 3).join(", ")}${missingSkills.length > 3 ? " +" + (missingSkills.length - 3) + " more" : ""}`
            : "Add more skill tags with proficiency ≥ 3"
          : undefined,
        tip: skillStatus === "pass"
          ? "Skill match is strong for this listing."
          : `Add these skill tags to your profile: ${missingSkills.slice(0, 3).join(", ") || "update proficiency levels"}.`,
      };

      // ── Trust factor ───────────────────────────────────────────────────────
      const trustStatus = trustScore >= minTrust ? "pass"
        : trustScore >= minTrust - 15 ? "partial" : "fail";
      const trustFactor = {
        id:        "trust",
        category:  "Trust",
        label:     "Trust Score",
        yourValue: `${trustScore} / 100`,
        required:  `≥ ${minTrust}`,
        status:    trustStatus as "pass" | "fail" | "partial",
        weight:    25,
        gap:       trustStatus !== "pass"
          ? `${minTrust - trustScore} points below threshold`
          : undefined,
        tip: trustStatus === "pass"
          ? "Trust score meets this listing's minimum."
          : profile.tier === "BIOMETRIC_VERIFIED"
            ? "Connect GitHub and LinkedIn to increase your trust score."
            : "Complete biometric verification to gain +40 trust points and reach Tier 2.",
      };

      // ── Rate factor ────────────────────────────────────────────────────────
      const dayRateCents = rateCents != null ? rateCents * 8 : null;
      const rateStatus   = dayRateCents == null ? "partial"
        : dayRateCents <= budget ? "pass" : "fail";
      const rateFactor = {
        id:        "rate",
        category:  "Rate",
        label:     "Rate Competitiveness",
        yourValue: rateCents != null ? `$${Math.round(rateCents / 100)}/hr` : "Not set",
        required:  `≤ ${formatBudget(budget)} budget`,
        status:    rateStatus as "pass" | "fail" | "partial",
        weight:    20,
        gap:       rateStatus === "fail"
          ? `Day rate ${formatBudget(dayRateCents!)} exceeds budget ${formatBudget(budget)}`
          : rateStatus === "partial" ? "Set your hourly rate on your profile" : undefined,
        tip: rateStatus === "pass"
          ? "Rate is within the listing budget."
          : rateStatus === "partial"
            ? "Add your hourly rate to your profile so clients can evaluate competitiveness."
            : "Consider offering a fixed-price SOW instead of hourly for this budget range.",
      };

      // ── Portfolio factor ───────────────────────────────────────────────────
      const portStatus = deployments >= 3 ? "pass" : deployments >= 1 ? "partial" : "fail";
      const portFactor = {
        id:        "portfolio",
        category:  "Portfolio",
        label:     "Verified Deployments",
        yourValue: `${deployments} verified`,
        required:  "≥ 3 preferred",
        status:    portStatus as "pass" | "fail" | "partial",
        weight:    15,
        gap:       portStatus !== "pass"
          ? `${3 - deployments} more verified deployment${3 - deployments === 1 ? "" : "s"} needed`
          : undefined,
        tip: portStatus === "pass"
          ? "Strong deployment history."
          : "Complete more deployments through the platform to build verified portfolio evidence.",
      };

      // ── Response/Repeat factor — no live DB signal, always partial ─────────
      const responseFactor = {
        id:        "response",
        category:  "Response",
        label:     "Response / Repeat Hire",
        yourValue: "N/A",
        required:  "< 2h response, > 25% repeat",
        status:    "partial" as const,
        weight:    10,
        tip:       "Enable notifications and respond to proposals within 2h. A single repeat hire significantly boosts this score.",
      };

      return {
        id:        job.request_id,
        title:     job.job_title,
        client:    maskClient(job.client_email, job.listing_id),
        budget:    formatBudget(budget),
        postedAt:  String(job.created_at).slice(0, 10),
        yourScore: Math.round(Number(job.your_score) * 100),
        topScore:  Math.round(Number(job.top_score)  * 100),
        factors:   [skillFactor, trustFactor, rateFactor, portFactor, responseFactor],
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[transparency/missed-jobs]", err);
    return NextResponse.json(
      { error: "Failed to load transparency data" },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}
