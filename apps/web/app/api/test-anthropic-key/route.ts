export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let apiKey: string;
  try {
    const body = await req.json() as { api_key?: string };
    apiKey = (body.api_key ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!apiKey || apiKey.length < 20) {
    return NextResponse.json({ error: "No API key provided" }, { status: 400 });
  }

  try {
    const llm = new ChatAnthropic({
      apiKey,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 10,
    });
    await llm.invoke([new HumanMessage("ping")]);
    return NextResponse.json({ valid: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ valid: false, error: msg }, { status: 200 });
  }
}
