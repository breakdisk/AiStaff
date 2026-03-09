// Shared types for the Freelancer Proposal Copilot.
// Imported by: lib/proposal-copilot/graph.ts, app/api/proposal-copilot/route.ts,
//              app/proposals/draft/page.tsx

import type { BaseMessage } from "@langchain/core/messages";

// ── Job brief (passed in from the scoping/SOW flow) ───────────────────────

export interface JobBrief {
  title:       string;
  summary:     string;
  budget:      string;
  timeline:    string;
  skills:      string[];
  requirements: string[];
}

// ── Generated proposal draft ──────────────────────────────────────────────

export interface ProposalDraft {
  cover_letter:        string;   // 2-3 paragraph personalised cover letter
  technical_approach:  string;   // how the freelancer plans to tackle it
  proposed_timeline:   string;   // e.g. "12 business days"
  proposed_budget:     string;   // e.g. "$4,800"
  key_deliverables:    string[]; // 3-5 bullet points
  why_me:              string;   // 1-2 sentences differentiator
}

// ── LangGraph agent state ─────────────────────────────────────────────────

export interface CopilotState {
  messages:       BaseMessage[];
  question_count: number;        // 0-2 intake questions
  answers:        string[];
  job_brief:      JobBrief | null;
  draft:          ProposalDraft | null;
}

// ── API contract ──────────────────────────────────────────────────────────

export interface CopilotRequest {
  session_id: string;
  message:    string;
  job_brief?: JobBrief;   // only on the first message
}

export interface CopilotResponse {
  reply:   string;
  phase:   number;         // 0-2 = intake, 3 = draft ready
  draft?:  ProposalDraft;
}
