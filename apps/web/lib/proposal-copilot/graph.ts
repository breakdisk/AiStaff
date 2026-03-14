// LangGraph Freelancer Proposal Copilot — server-side only.
// Never import this in "use client" files.

import {
  StateGraph,
  Annotation,
  messagesStateReducer,
} from "@langchain/langgraph";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { z } from "zod";
import type { ProposalDraft, JobBrief, CopilotState } from "./types";
import {
  type AiProvider,
  resolveFastLlm,
  resolveCapableLlm,
} from "@/lib/ai-provider";

// ── Zod schema for structured proposal output ─────────────────────────────

const ProposalSchema = z.object({
  cover_letter: z.string().describe(
    "2-3 paragraphs. Open by referencing a specific detail from the job brief. " +
    "Middle paragraph: relevant past experience. Close: clear call to action.",
  ),
  technical_approach: z.string().describe(
    "2-3 sentences explaining the specific technical strategy for this project.",
  ),
  proposed_timeline: z.string().describe(
    "Concrete timeline, e.g. '11 business days across 3 phases'.",
  ),
  proposed_budget: z.string().describe(
    "Specific budget with $ sign based on their rate and scope, e.g. '$4,200'.",
  ),
  key_deliverables: z
    .array(z.string())
    .min(3)
    .max(5)
    .describe("3-5 concrete deliverables the freelancer will produce."),
  why_me: z.string().describe(
    "1-2 sentences: the single strongest differentiator this freelancer brings.",
  ),
});

// ── LangGraph state annotation ─────────────────────────────────────────────

const GraphState = Annotation.Root({
  messages:       Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  question_count: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  answers:        Annotation<string[]>({ reducer: (_, n) => n, default: () => [] }),
  job_brief:      Annotation<JobBrief | null>({ reducer: (_, n) => n, default: () => null }),
  draft:          Annotation<ProposalDraft | null>({ reducer: (_, n) => n, default: () => null }),
  user_api_key:   Annotation<string>({ reducer: (_, n) => n, default: () => "" }),
  user_provider:  Annotation<AiProvider>({ reducer: (_, n) => n, default: () => "anthropic" }),
});

export type CopilotStateType = typeof GraphState.State;

// ── LLM helpers — delegate to multi-provider factory ─────────────────────

// ── Helper ─────────────────────────────────────────────────────────────────

function extractText(content: BaseMessage["content"]): string {
  if (typeof content === "string") return content;
  return (content as Array<{ text?: string }>).map((b) => b.text ?? "").join("");
}

function briefToText(brief: JobBrief): string {
  return [
    `Title: ${brief.title}`,
    `Summary: ${brief.summary}`,
    `Budget: ${brief.budget}`,
    `Timeline: ${brief.timeline}`,
    `Required skills: ${brief.skills.join(", ")}`,
    `Requirements: ${brief.requirements.join(" | ")}`,
  ].join("\n");
}

// ── Node 1: intake_node ────────────────────────────────────────────────────
// Asks the freelancer 3 targeted questions to personalise the proposal.

const INTAKE_SYSTEM = `You are an AI Proposal Copilot helping a freelancer on AiStaff write a strong, personalised technical proposal.

Your job is to ask SHORT, targeted questions to gather the context needed to write a compelling proposal. You are NOT a client — you are helping the freelancer.

Rules:
- Ask ONE question per response
- Be direct and concise — no filler
- Cover 3 topics across 3 questions:
  1. Relevant past experience or portfolio work that matches this job
  2. Their proposed technical approach / stack for this specific project
  3. Their rate and rough timeline estimate
- After the freelancer answers, acknowledge briefly (1 sentence) then ask next question
- Tone: collegial, efficient — like a senior colleague helping review a proposal draft

Platform context: AiStaff uses Wasm sandboxes, ZK identity, and DoD checklists. Clients expect technical specificity.`;

export async function intake_node(
  state: CopilotStateType,
): Promise<Partial<CopilotStateType>> {
  const isFirst = state.question_count === 0;
  const briefText = state.job_brief ? briefToText(state.job_brief) : "(No brief provided)";

  const userPrompt = isFirst
    ? `The freelancer wants to apply to this job:\n\n${briefText}\n\nGreet them briefly (1 sentence), then ask your first question about their relevant past experience or portfolio work that directly matches this brief.`
    : `Job brief:\n${briefText}\n\nFreelancer answers so far:\n${state.answers
        .map((a, i) => `Answer ${i + 1}: ${a}`)
        .join("\n")}\n\nYou have asked ${state.question_count} question(s). Ask your next question. Do not repeat topics already covered.`;

  const response = await resolveFastLlm(state.user_provider, state.user_api_key, 300).invoke([
    new SystemMessage(INTAKE_SYSTEM),
    ...state.messages,
    new HumanMessage(userPrompt),
  ]);

  return {
    messages:       [new AIMessage(extractText(response.content))],
    question_count: state.question_count + 1,
  };
}

// ── Node 2: generate_draft_node ────────────────────────────────────────────
// Uses Claude Sonnet + structured output to generate the full proposal draft.

const DRAFT_SYSTEM = `You are an expert technical writer generating a winning freelancer proposal for the AiStaff marketplace.

AiStaff platform context:
- All deployments run in Wasm sandboxes (Wasmtime) — technical credibility matters
- Clients expect a 6-step DoD checklist, artifact hash verification, and 7-day warranty
- Escrow: 70% developer / 30% talent — client pays upfront, held in escrow
- Identity tiers: mention Tier 2 biometric verification if relevant

Proposal writing rules:
- Cover letter: open by referencing a SPECIFIC detail from the job brief (not generic)
- Show, don't tell: reference concrete past work, metrics, or techniques
- Be realistic about budget — don't undercut or overbid wildly
- Technical approach should mention AiStaff-specific tech (Wasm, ZK, DoD) where relevant
- Key deliverables must be concrete and measurable`;

export async function generate_draft_node(
  state: CopilotStateType,
): Promise<Partial<CopilotStateType>> {
  const briefText = state.job_brief ? briefToText(state.job_brief) : "(No brief)";
  const answersText = state.answers
    .map((a, i) => `Freelancer answer ${i + 1}: ${a}`)
    .join("\n");

  const draft = (await resolveCapableLlm(state.user_provider, state.user_api_key, 2000)
    .withStructuredOutput(ProposalSchema, { name: "generate_proposal" })
    .invoke([
    new SystemMessage(DRAFT_SYSTEM),
    new HumanMessage(
      `Job brief:\n${briefText}\n\nFreelancer background (from intake):\n${answersText}\n\nGenerate a complete proposal draft.`,
    ),
  ])) as ProposalDraft;

  const reply =
    `Your proposal draft is ready. It includes a personalised cover letter, ` +
    `technical approach, ${draft.key_deliverables.length} key deliverables, ` +
    `and a budget of ${draft.proposed_budget} over ${draft.proposed_timeline}. ` +
    `Review and edit below before submitting.`;

  return {
    draft,
    messages: [new AIMessage(reply)],
  };
}

// ── Session store ──────────────────────────────────────────────────────────

interface SessionEntry {
  state:      CopilotStateType;
  lastAccess: number;
}

const SESSION_MAP = new Map<string, SessionEntry>();
const TTL_MS = 30 * 60 * 1000;

export function getSession(id: string): CopilotStateType | null {
  const entry = SESSION_MAP.get(id);
  if (!entry) return null;
  if (Date.now() - entry.lastAccess > TTL_MS) {
    SESSION_MAP.delete(id);
    return null;
  }
  entry.lastAccess = Date.now();
  return entry.state;
}

export function setSession(id: string, state: CopilotStateType): void {
  if (SESSION_MAP.size > 500) {
    const now = Date.now();
    for (const [k, v] of SESSION_MAP.entries()) {
      if (now - v.lastAccess > TTL_MS) SESSION_MAP.delete(k);
    }
  }
  SESSION_MAP.set(id, { state, lastAccess: Date.now() });
}

export function initSession(
  id: string,
  jobBrief: JobBrief | null,
  userApiKey = "",
  userProvider: AiProvider = "anthropic",
): CopilotStateType {
  const fresh: CopilotStateType = {
    messages:       [],
    question_count: 0,
    answers:        [],
    job_brief:      jobBrief,
    draft:          null,
    user_api_key:   userApiKey,
    user_provider:  userProvider,
  };
  setSession(id, fresh);
  return fresh;
}

// ── Graph definition ───────────────────────────────────────────────────────

export function buildGraph() {
  return new StateGraph(GraphState)
    .addNode("intake",         intake_node)
    .addNode("generate_draft", generate_draft_node)
    .addEdge("__start__",      "intake")
    .addEdge("generate_draft", "__end__")
    .compile();
}
