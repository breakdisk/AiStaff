export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import type { ProposalDraft, JobBrief } from "@/lib/proposal-copilot/types";

// ── Postgres connection (server-side only) ─────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
});

// ── Notification helper ────────────────────────────────────────────────────
// Tries to hit the Rust notification_service at :3012.
// Falls back gracefully if offline — the submission still succeeds.

async function tryNotify(payload: {
  recipient_email: string;
  subject:         string;
  body:            string;
}): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:3012/notify", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false; // notification service offline — submission still succeeds
  }
}

export interface SubmitRequest {
  draft:      ProposalDraft;
  job_brief:  JobBrief;
  freelancer_email?: string;
  client_email?:     string;
}

export interface SubmitResponse {
  proposal_id:    string;
  submitted_at:   string;
  notifications:  {
    freelancer: { sent: boolean; email: string };
    client:     { sent: boolean; email: string };
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: SubmitRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { draft, job_brief } = body;
  if (!draft || !job_brief) {
    return NextResponse.json({ error: "draft and job_brief are required" }, { status: 400 });
  }

  const freelancerEmail = body.freelancer_email ?? "freelancer@demo.aistaff.app";
  const clientEmail     = body.client_email     ?? "client@demo.aistaff.app";

  // Persist to DB (falls back gracefully if DB is unreachable during dev)
  let proposal_id  = `prop-${crypto.randomUUID().slice(0, 8)}`;
  let submitted_at = new Date().toISOString();

  try {
    const result = await pool.query<{ id: string; submitted_at: Date }>(
      `INSERT INTO proposals
         (job_title, cover_letter, technical_approach, proposed_timeline,
          proposed_budget, key_deliverables, why_me, freelancer_email, client_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, submitted_at`,
      [
        job_brief.title,
        draft.cover_letter,
        draft.technical_approach,
        draft.proposed_timeline,
        draft.proposed_budget,
        draft.key_deliverables,
        draft.why_me,
        freelancerEmail,
        clientEmail,
      ],
    );
    proposal_id  = result.rows[0].id;
    submitted_at = result.rows[0].submitted_at.toISOString();
  } catch {
    // DB unavailable (e.g. local dev without docker) — continue with generated ID
  }

  // Fire notifications concurrently (non-blocking)
  const [freelancerSent, clientSent] = await Promise.all([
    tryNotify({
      recipient_email: freelancerEmail,
      subject:         `Proposal submitted — ${job_brief.title}`,
      body:
        `Your proposal for "${job_brief.title}" has been submitted (${proposal_id}).\n\n` +
        `Budget: ${draft.proposed_budget} · Timeline: ${draft.proposed_timeline}\n\n` +
        `You will be notified when the client reviews it.`,
    }),
    tryNotify({
      recipient_email: clientEmail,
      subject:         `New proposal received — ${job_brief.title}`,
      body:
        `A new proposal has been submitted for "${job_brief.title}" (${proposal_id}).\n\n` +
        `Proposed budget: ${draft.proposed_budget} · Timeline: ${draft.proposed_timeline}\n\n` +
        `The proposal has been AI-scored and is ready for your review at /proposals.`,
    }),
  ]);

  return NextResponse.json({
    proposal_id,
    submitted_at,
    notifications: {
      freelancer: { sent: freelancerSent, email: freelancerEmail },
      client:     { sent: clientSent,     email: clientEmail     },
    },
  } satisfies SubmitResponse);
}

// GET — list proposals from DB (falls back to empty array if DB unavailable)
export async function GET(): Promise<NextResponse> {
  try {
    const result = await pool.query(
      "SELECT * FROM proposals ORDER BY submitted_at DESC LIMIT 100",
    );
    return NextResponse.json(result.rows);
  } catch {
    return NextResponse.json([]);
  }
}
