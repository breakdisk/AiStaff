export const runtime = "nodejs";

/**
 * POST /api/reputation/[talentId]/export
 *
 * Computes a W3C Verifiable Credential from live DB data.
 * Mirrors the Rust reputation_service logic exactly:
 *   score = 40% checklist_pass_pct + 30% drift_free_rate + 30% (trust_score / 100)
 *
 * Runs directly in Next.js so it works even when the Rust
 * reputation_service container is not deployed yet.
 */

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

const PLATFORM_DID = process.env.PLATFORM_DID ?? "did:aistaff:platform";

function reputationScore(passPct: number, driftFree: number, trustScore: number): number {
  return (0.40 * passPct + 0.30 * driftFree + 0.30 * (trustScore / 100)) * 100;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ talentId: string }> },
) {
  const { talentId } = await params;

  // Basic UUID validation
  if (!/^[0-9a-f-]{36}$/i.test(talentId)) {
    return NextResponse.json({ error: "Invalid talentId" }, { status: 400 });
  }

  let client;
  try {
    client = await pool.connect();

    const { rows } = await client.query(
      `SELECT
         COALESCE(tr.total_deployments, 0)       AS total_deployments,
         COALESCE(tr.avg_checklist_pass_pct, 0)  AS avg_checklist_pass_pct,
         COALESCE(tr.drift_incidents, 0)         AS drift_incidents,
         COALESCE(up.trust_score, 0)             AS trust_score,
         up.identity_tier::TEXT                  AS tier
       FROM unified_profiles up
       LEFT JOIN talent_roi tr ON tr.talent_id = up.id
       WHERE up.id = $1`,
      [talentId],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const row = rows[0];
    const total      = parseInt(row.total_deployments, 10)   || 0;
    const passPct    = parseFloat(row.avg_checklist_pass_pct) || 0;
    const drift      = parseInt(row.drift_incidents, 10)      || 0;
    const trust      = Number(row.trust_score)                || 0;
    const driftFree  = total > 0 ? 1 - drift / total : 1;
    const score      = Math.min(100, Math.max(0, reputationScore(passPct, driftFree, trust)));
    const tier       = row.tier ?? "Unverified";
    const issuedAt   = new Date().toISOString();
    const vcId       = `urn:aistaff:vc:reputation:${talentId}`;

    const vc = {
      "@context": [
        "https://www.w3.org/2018/credentials/v1",
        "https://schema.aistaffglobal.com/reputation/v1",
      ],
      id:   vcId,
      type: ["VerifiableCredential", "ReputationCredential"],
      issuer:       PLATFORM_DID,
      issuanceDate: issuedAt,
      credentialSubject: {
        id:                   `did:aistaff:talent:${talentId}`,
        reputationScore:      Math.round(score * 10) / 10,
        deploymentsCompleted: total,
        identityTier:         tier,
        scoreBreakdown: {
          checklistPassRate: Math.round(passPct * 1000) / 1000,
          driftFreeRate:     Math.round(driftFree * 1000) / 1000,
          trustScore:        trust,
        },
      },
    };

    // Upsert to reputation_vcs for GET /vc retrieval
    await client.query(
      `INSERT INTO reputation_vcs (id, talent_id, vc_jwt, issued_at)
       VALUES (gen_random_uuid(), $1, $2, NOW())
       ON CONFLICT (talent_id) DO UPDATE SET vc_jwt = EXCLUDED.vc_jwt, issued_at = NOW()`,
      [talentId, JSON.stringify(vc)],
    );

    return NextResponse.json(vc);
  } catch (err) {
    console.error("[reputation/export]", err);
    return NextResponse.json(
      { error: "Failed to compute reputation score" },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}
