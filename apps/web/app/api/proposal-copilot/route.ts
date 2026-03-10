export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { HumanMessage } from "@langchain/core/messages";
import {
  getSession,
  setSession,
  initSession,
  intake_node,
  generate_draft_node,
} from "@/lib/proposal-copilot/graph";
import type { CopilotRequest, CopilotResponse } from "@/lib/proposal-copilot/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: CopilotRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { session_id, message, job_brief } = body;
  if (!session_id || !message?.trim()) {
    return NextResponse.json(
      { error: "session_id and message are required" },
      { status: 400 },
    );
  }

  // Load or init session — pass job_brief on first call to seed state
  let state = getSession(session_id) ?? initSession(session_id, job_brief ?? null);

  // If a brief was provided and not yet stored, attach it
  if (job_brief && !state.job_brief) {
    state = { ...state, job_brief };
  }

  // Append the human message
  state = {
    ...state,
    messages: [...state.messages, new HumanMessage(message)],
    answers:  [...state.answers, message],
  };

  try {
    if (state.question_count < 3) {
      // ── INTAKE: 3 questions about the freelancer's background/approach ──
      const next = await intake_node(state);
      state = { ...state, ...next };

      const lastMsg  = state.messages[state.messages.length - 1];
      const reply    =
        typeof lastMsg.content === "string"
          ? lastMsg.content
          : (lastMsg.content as Array<{ text?: string }>)
              .map((b) => b.text ?? "")
              .join("");

      setSession(session_id, state);

      return NextResponse.json({
        reply,
        phase: state.question_count,
      } satisfies CopilotResponse);
    } else {
      // ── GENERATION: produce the full proposal draft ──────────────────────
      const next = await generate_draft_node(state);
      state = { ...state, ...next };

      const lastMsg = state.messages[state.messages.length - 1];
      const reply   =
        typeof lastMsg.content === "string"
          ? lastMsg.content
          : (lastMsg.content as Array<{ text?: string }>)
              .map((b) => b.text ?? "")
              .join("");

      setSession(session_id, state);

      return NextResponse.json({
        reply,
        phase: 3,
        draft: state.draft ?? undefined,
      } satisfies CopilotResponse);
    }
  } catch (err) {
    void err;
    return NextResponse.json(
      { error: "Copilot error — check ANTHROPIC_API_KEY in .env.local" },
      { status: 500 },
    );
  }
}
