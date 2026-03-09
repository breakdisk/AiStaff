// Shared types for the AI PM Agent.
// Imported by: lib/pm-agent/graph.ts, app/api/pm-agent/route.ts, app/scoping/page.tsx

import type { BaseMessage } from "@langchain/core/messages";

// ── SOW types (identical to the interfaces in scoping/page.tsx) ────────────

export interface SowMilestone {
  phase:       string;
  deliverable: string;
  timeline:    string;
  price:       string;
}

export interface Sow {
  title:        string;
  summary:      string;
  milestones:   SowMilestone[];
  total_budget: string;
  timeline:     string;
  requirements: string[];
}

// ── Match candidate (mirrors MatchCandidate in matching/page.tsx) ──────────

export interface MatchCandidate {
  id:              string;
  name:            string;
  title:           string;
  location:        string;
  trust_score:     number;
  identity_tier:   0 | 1 | 2;
  match_score:     number;      // 0–1
  skills_score:    number;      // 0–100
  past_work_score: number;      // 0–100
  behavior_score:  number;      // 0–100
  skill_tags:      string[];
  rate_cents:      number;
  availability:    "available" | "limited" | "unavailable";
  deployments:     number;
}

// ── LangGraph agent state ──────────────────────────────────────────────────

export interface PMAgentState {
  messages:        BaseMessage[];
  question_count:  number;
  answers:         string[];
  brief:           string;
  sow:             Sow | null;
  top_freelancers: MatchCandidate[];
}

// ── API contract ───────────────────────────────────────────────────────────

export interface PMAgentRequest {
  session_id: string;
  message:    string;
}

export interface PMAgentResponse {
  reply:        string;
  phase:        number;    // 0–4 = intake questions, 5 = SOW done
  sow?:         Sow;
  freelancers?: MatchCandidate[];
}
