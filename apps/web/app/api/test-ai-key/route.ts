export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { HumanMessage } from "@langchain/core/messages";
import { createFastLlm, type AiProvider, PROVIDER_LIST } from "@/lib/ai-provider";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let provider: AiProvider;
  let apiKey: string;

  try {
    const body = await req.json() as { provider?: string; api_key?: string };
    apiKey   = (body.api_key ?? "").trim();
    provider = (PROVIDER_LIST.includes(body.provider as AiProvider)
      ? body.provider
      : "anthropic") as AiProvider;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!apiKey || apiKey.length < 8) {
    return NextResponse.json({ error: "No API key provided" }, { status: 400 });
  }

  try {
    const llm = createFastLlm(provider, apiKey, 10);
    await llm.invoke([new HumanMessage("ping")]);
    return NextResponse.json({ valid: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ valid: false, error: msg }, { status: 200 });
  }
}
