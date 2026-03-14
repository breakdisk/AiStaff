// LangGraph AI PM Agent — server-side only.
// Never import this in "use client" files.

import {
  StateGraph,
  Annotation,
  messagesStateReducer,
} from "@langchain/langgraph";
import { ChatAnthropic } from "@langchain/anthropic";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { z } from "zod";
import type { Sow, MatchCandidate, PMAgentState } from "./types";

// ── Zod schema for structured SOW output ──────────────────────────────────

const SowMilestoneSchema = z.object({
  phase:       z.string().describe("Phase name, e.g. 'Phase 1 — Discovery & Scoping'"),
  deliverable: z.string().describe("Concrete deliverable description"),
  timeline:    z.string().describe("Duration, e.g. '3 business days'"),
  price:       z.string().describe("Price with $ sign, e.g. '$800'"),
});

const SowSchema = z.object({
  title:        z.string().describe("SOW document title including project type"),
  summary:      z.string().describe("2-3 sentence project summary referencing AiStaff escrow and warranty"),
  milestones:   z.array(SowMilestoneSchema).length(4).describe("Exactly 4 project phases"),
  total_budget: z.string().describe("Total budget with $ sign"),
  timeline:     z.string().describe("Total timeline, e.g. '~13 business days'"),
  requirements: z.array(z.string()).min(3).max(6).describe("Project requirements and constraints"),
});

// ── LangGraph state annotation ─────────────────────────────────────────────

const GraphState = Annotation.Root({
  messages:        Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  question_count:  Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  answers:         Annotation<string[]>({ reducer: (_, n) => n, default: () => [] }),
  brief:           Annotation<string>({ reducer: (_, n) => n, default: () => "" }),
  sow:             Annotation<Sow | null>({ reducer: (_, n) => n, default: () => null }),
  top_freelancers: Annotation<MatchCandidate[]>({ reducer: (_, n) => n, default: () => [] }),
  user_api_key:    Annotation<string>({ reducer: (_, n) => n, default: () => "" }),
});

export type GraphStateType = typeof GraphState.State;

// ── LLM helpers — use user key if provided, else fall back to platform key ─

const PLACEHOLDER = "build-placeholder";

let _intakeLlm: ChatAnthropic | null = null;
function getIntakeLlm(userKey?: string) {
  if (userKey && userKey !== PLACEHOLDER) {
    return new ChatAnthropic({ apiKey: userKey, model: "claude-haiku-4-5-20251001", maxTokens: 350 });
  }
  if (!_intakeLlm) _intakeLlm = new ChatAnthropic({ model: "claude-haiku-4-5-20251001", maxTokens: 350 });
  return _intakeLlm;
}

let _sowLlmStructured: ReturnType<typeof buildSowLlm> | null = null;
function buildSowLlm(userKey?: string) {
  return new ChatAnthropic({
    ...(userKey && userKey !== PLACEHOLDER ? { apiKey: userKey } : {}),
    model: "claude-sonnet-4-6",
    maxTokens: 2000,
  }).withStructuredOutput(SowSchema, { name: "generate_sow" });
}
function getSowLlmStructured(userKey?: string) {
  if (userKey && userKey !== PLACEHOLDER) return buildSowLlm(userKey);
  if (!_sowLlmStructured) _sowLlmStructured = buildSowLlm();
  return _sowLlmStructured;
}

// ── Helper: extract text from AIMessage content ────────────────────────────

function extractText(content: BaseMessage["content"]): string {
  if (typeof content === "string") return content;
  return (content as Array<{ text?: string }>)
    .map((b) => b.text ?? "")
    .join("");
}

// ── Node 1: intake_node ────────────────────────────────────────────────────

const INTAKE_SYSTEM = `You are an experienced AI Project Manager at AiStaff — a marketplace for agentic AI and robotics deployments.

Your role: conduct a structured discovery conversation to scope a Statement of Work.

Rules:
- Ask ONE targeted, open-ended question per response
- Build on the user's prior answers — reference what they said
- Do NOT repeat topics already covered
- Topics to cover across 4 questions: (1) project outcomes, (2) timeline/deadlines, (3) budget range, (4) technical integrations/systems
- Keep responses concise: acknowledge their answer in 1 sentence, then ask your next question
- Tone: professional and direct — no filler phrases like "Great!" or "Absolutely!"

AiStaff context:
- All agents run in Wasm sandboxes with ZK-verified identity
- Deployments have a 7-day mechanic's warranty (fix-or-refund)
- Escrow: 70% developer / 30% talent, released after 6-step DoD checklist`;

export async function intake_node(
  state: GraphStateType,
): Promise<Partial<GraphStateType>> {
  const isFirst = state.question_count === 0;

  const userPrompt = isFirst
    ? `The client provided this initial project brief: "${state.brief}"

Greet them briefly (1 sentence), acknowledge their brief, then ask your first discovery question about the primary business outcome they want to achieve.`
    : `Conversation so far:
${state.answers.map((a, i) => `Answer ${i + 1}: ${a}`).join("\n")}

You have asked ${state.question_count} question(s). Ask your next discovery question. Do not revisit topics already answered.`;

  const response = await getIntakeLlm(state.user_api_key).invoke([
    new SystemMessage(INTAKE_SYSTEM),
    ...state.messages,
    new HumanMessage(userPrompt),
  ]);

  const aiReply = extractText(response.content);

  return {
    messages:       [new AIMessage(aiReply)],
    question_count: state.question_count + 1,
  };
}

// ── Node 2: generate_sow_node ──────────────────────────────────────────────

const SOW_SYSTEM = `You are an expert technical project manager. Generate a detailed Statement of Work for an AiStaff marketplace deployment.

Platform context:
- All agents run in Wasm sandboxes (Wasmtime) — performance and security are guaranteed
- Installers must hold Tier 2 identity (ZK biometric verified) to touch production
- Escrow releases only after a 6-step Definition of Done checklist is signed off
- Every deployment has a 7-day mechanic's warranty: fix-or-refund if post-install drift detected
- Pricing: escrow is 70% developer / 30% talent

SOW generation rules:
- Realistic pricing based on complexity ($3k–$15k typical range)
- Realistic timelines (8–25 business days typical)
- Requirements must include: escrow terms, identity tier, warranty, DoD checklist
- Phase 1 = Discovery, Phase 2 = Configuration, Phase 3 = Deployment, Phase 4 = Handoff + Warranty`;

export async function generate_sow_node(
  state: GraphStateType,
): Promise<Partial<GraphStateType>> {
  const conversationText = state.answers
    .map((a, i) => `Discovery Answer ${i + 1}: ${a}`)
    .join("\n");

  const sow = (await getSowLlmStructured(state.user_api_key).invoke([
    new SystemMessage(SOW_SYSTEM),
    new HumanMessage(
      `Project Brief: ${state.brief}\n\nDiscovery Conversation:\n${conversationText}\n\nGenerate a complete SOW with exactly 4 milestone phases.`,
    ),
  ])) as Sow;

  const aiReply = `I've generated your Statement of Work based on our conversation. Review it below — it covers ${sow.milestones.length} phases with a total budget of ${sow.total_budget} over ${sow.timeline}. Post it to the Marketplace when ready.`;

  return {
    sow,
    messages: [new AIMessage(aiReply)],
  };
}

// ── Node 3: trigger_matching_node ──────────────────────────────────────────

const KNOWN_SKILLS = [
  "rust", "wasm", "kafka", "postgres", "mlops", "k8s",
  "python", "typescript", "react", "docker", "solidity",
  "go", "java", "grpc", "redis", "elasticsearch",
];

const DEMO_FREELANCERS: MatchCandidate[] = [
  {
    id: "tal-001", name: "Marcus T.", title: "Senior Rust / Wasm Engineer",
    location: "Berlin, DE", trust_score: 94, identity_tier: 2,
    match_score: 0.94, skills_score: 97, past_work_score: 91, behavior_score: 93,
    skill_tags: ["rust", "wasm", "kafka", "postgres"],
    rate_cents: 18500, availability: "available", deployments: 24,
  },
  {
    id: "tal-002", name: "Lena K.", title: "ML Systems Architect",
    location: "Amsterdam, NL", trust_score: 88, identity_tier: 2,
    match_score: 0.87, skills_score: 89, past_work_score: 86, behavior_score: 85,
    skill_tags: ["rust", "mlops", "kafka", "python"],
    rate_cents: 21000, availability: "available", deployments: 17,
  },
  {
    id: "tal-003", name: "Diego R.", title: "DevOps + Wasm Specialist",
    location: "Buenos Aires, AR", trust_score: 72, identity_tier: 1,
    match_score: 0.78, skills_score: 82, past_work_score: 74, behavior_score: 78,
    skill_tags: ["wasm", "k8s", "docker", "rust"],
    rate_cents: 9500, availability: "limited", deployments: 9,
  },
];

function extractSkillTags(sow: Sow): string[] {
  const text = [
    sow.title, sow.summary,
    ...sow.requirements,
    ...sow.milestones.map((m) => m.deliverable),
  ].join(" ").toLowerCase();

  const found = KNOWN_SKILLS.filter((s) => text.includes(s));
  if (!found.includes("wasm")) found.push("wasm"); // always required
  return found;
}

export async function trigger_matching_node(
  state: GraphStateType,
): Promise<Partial<GraphStateType>> {
  if (!state.sow) return { top_freelancers: DEMO_FREELANCERS };

  const skills = extractSkillTags(state.sow);

  try {
    const res = await fetch("http://localhost:3005/match", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        request_id:      crypto.randomUUID(),
        agent_id:        "pm-agent-scoping",
        required_skills: skills,
        min_trust_score: 0.5,
      }),
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) throw new Error(`matching_service returned ${res.status}`);

    const data = (await res.json()) as {
      matches: Array<{
        talent_id:   string;
        match_score: number;
        trust_score: number;
        skill_tags:  string[];
      }>;
    };

    if (!data.matches?.length) return { top_freelancers: DEMO_FREELANCERS };

    const candidates: MatchCandidate[] = data.matches.map((m, i) => ({
      id:              m.talent_id,
      name:            `Talent ${i + 1}`,
      title:           m.skill_tags.slice(0, 3).join(" / ") + " specialist",
      location:        "Remote",
      trust_score:     Math.round(m.trust_score * 100),
      identity_tier:   m.trust_score >= 0.8 ? 2 : m.trust_score >= 0.5 ? 1 : 0,
      match_score:     m.match_score,
      skills_score:    Math.round(m.match_score * 100),
      past_work_score: Math.round(m.trust_score * 90),
      behavior_score:  Math.round(m.trust_score * 85),
      skill_tags:      m.skill_tags,
      rate_cents:      15000,
      availability:    "available",
      deployments:     0,
    }));

    return { top_freelancers: candidates };
  } catch {
    // Rust backend offline or timed out — fall back to demo data
    return { top_freelancers: DEMO_FREELANCERS };
  }
}

// ── Session store ──────────────────────────────────────────────────────────

interface SessionEntry {
  state:      GraphStateType;
  lastAccess: number;
}

const SESSION_MAP = new Map<string, SessionEntry>();
const TTL_MS = 30 * 60 * 1000; // 30 minutes

export function getSession(id: string): GraphStateType | null {
  const entry = SESSION_MAP.get(id);
  if (!entry) return null;
  if (Date.now() - entry.lastAccess > TTL_MS) {
    SESSION_MAP.delete(id);
    return null;
  }
  entry.lastAccess = Date.now();
  return entry.state;
}

export function setSession(id: string, state: GraphStateType): void {
  if (SESSION_MAP.size > 500) {
    const now = Date.now();
    for (const [k, v] of SESSION_MAP.entries()) {
      if (now - v.lastAccess > TTL_MS) SESSION_MAP.delete(k);
    }
  }
  SESSION_MAP.set(id, { state, lastAccess: Date.now() });
}

export function initSession(id: string, userApiKey = ""): GraphStateType {
  const fresh: GraphStateType = {
    messages:        [],
    question_count:  0,
    answers:         [],
    brief:           "",
    sow:             null,
    top_freelancers: [],
    user_api_key:    userApiKey,
  };
  setSession(id, fresh);
  return fresh;
}

// ── Graph definition (used for type inference; nodes are called manually) ──

export function buildGraph() {
  return new StateGraph(GraphState)
    .addNode("intake",           intake_node)
    .addNode("generate_sow",     generate_sow_node)
    .addNode("trigger_matching", trigger_matching_node)
    .addEdge("__start__",        "intake")
    .addEdge("generate_sow",     "trigger_matching")
    .addEdge("trigger_matching", "__end__")
    .compile();
}
