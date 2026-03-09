// Next.js App Router API route — AI PM Agent
// Must run in Node.js runtime (LangGraph requires Node APIs)
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { HumanMessage } from "@langchain/core/messages";
import {
  getSession,
  setSession,
  initSession,
  intake_node,
  generate_sow_node,
  trigger_matching_node,
} from "@/lib/pm-agent/graph";
import type { PMAgentRequest, PMAgentResponse } from "@/lib/pm-agent/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: PMAgentRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { session_id, message } = body;
  if (!session_id || !message?.trim()) {
    return NextResponse.json(
      { error: "session_id and message are required" },
      { status: 400 },
    );
  }

  // Load or initialise session
  let state = getSession(session_id) ?? initSession(session_id);

  // Append the human message and update conversation context
  state = {
    ...state,
    messages: [...state.messages, new HumanMessage(message)],
    answers:  [...state.answers, message],
    brief:    state.brief || message, // first message becomes the brief
  };

  try {
    if (state.question_count < 4) {
      // ── INTAKE: ask discovery questions ─────────────────────────────────
      const next = await intake_node(state);
      state = { ...state, ...next };

      const lastMsg = state.messages[state.messages.length - 1];
      const reply =
        typeof lastMsg.content === "string"
          ? lastMsg.content
          : (lastMsg.content as Array<{ text?: string }>)
              .map((b) => b.text ?? "")
              .join("");

      setSession(session_id, state);

      return NextResponse.json({
        reply,
        phase: state.question_count,
      } satisfies PMAgentResponse);
    } else {
      // ── GENERATION: SOW + matching ───────────────────────────────────────
      const sowNext = await generate_sow_node(state);
      state = { ...state, ...sowNext };

      const matchNext = await trigger_matching_node(state);
      state = { ...state, ...matchNext };

      const lastMsg = state.messages[state.messages.length - 1];
      const reply =
        typeof lastMsg.content === "string"
          ? lastMsg.content
          : (lastMsg.content as Array<{ text?: string }>)
              .map((b) => b.text ?? "")
              .join("");

      setSession(session_id, state);

      return NextResponse.json({
        reply,
        phase:       5,
        sow:         state.sow         ?? undefined,
        freelancers: state.top_freelancers.length > 0
          ? state.top_freelancers
          : undefined,
      } satisfies PMAgentResponse);
    }
  } catch (err) {
    console.error("[pm-agent] node error:", err);
    return NextResponse.json(
      { error: "Agent error — check ANTHROPIC_API_KEY in .env.local" },
      { status: 500 },
    );
  }
}
