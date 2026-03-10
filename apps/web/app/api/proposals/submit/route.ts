export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { ProposalDraft, JobBrief } from "@/lib/proposal-copilot/types";

// ── In-memory proposal store (replace with DB in production) ───────────────

interface StoredProposal {
  id:           string;
  job_title:    string;
  draft:        ProposalDraft;
  submitted_at: string;
  freelancer:   string;
  client:       string;
}

const PROPOSALS = new Map<string, StoredProposal>();

// ── Notification helper ────────────────────────────────────────────────────
// Tries to hit the Rust notification_service at :3010.
// Falls back gracefully if offline — the submission still succeeds.

async function tryNotify(payload: {
  recipient_email: string;
  subject:         string;
  body:            string;
}): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:3010/notify", {
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

  const proposal_id   = `prop-${crypto.randomUUID().slice(0, 8)}`;
  const submitted_at  = new Date().toISOString();

  // Demo email addresses — in production these come from the session / job record
  const freelancerEmail = body.freelancer_email ?? "freelancer@demo.aistaff.app";
  const clientEmail     = body.client_email     ?? "client@demo.aistaff.app";

  // Store the proposal
  PROPOSALS.set(proposal_id, {
    id:           proposal_id,
    job_title:    job_brief.title,
    draft,
    submitted_at,
    freelancer:   freelancerEmail,
    client:       clientEmail,
  });

  // Fire notifications (non-blocking — submission succeeds regardless)
  const [freelancerSent, clientSent] = await Promise.all([
    tryNotify({
      recipient_email: freelancerEmail,
      subject:         `Proposal submitted — ${job_brief.title}`,
      body:
        `Your proposal for "${job_brief.title}" has been submitted successfully (${proposal_id}).\n\n` +
        `Budget: ${draft.proposed_budget} · Timeline: ${draft.proposed_timeline}\n\n` +
        `The client will receive your proposal and the AI review engine will score it. ` +
        `You will be notified when the client reviews it.`,
    }),
    tryNotify({
      recipient_email: clientEmail,
      subject:         `New proposal received — ${job_brief.title}`,
      body:
        `A new proposal has been submitted for your job "${job_brief.title}" (${proposal_id}).\n\n` +
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

// GET — list all proposals (useful for the scoring page in future)
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(Array.from(PROPOSALS.values()));
}
