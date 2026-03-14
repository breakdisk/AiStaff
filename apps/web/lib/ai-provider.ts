// Multi-provider AI factory — server-side only.
// Never import this in "use client" files.

import { ChatAnthropic }           from "@langchain/anthropic";
import { ChatOpenAI }              from "@langchain/openai";
import { ChatGoogleGenerativeAI }  from "@langchain/google-genai";
import type { BaseChatModel }      from "@langchain/core/language_models/chat_models";

// ── Provider registry ─────────────────────────────────────────────────────

export type AiProvider =
  | "anthropic"
  | "openai"
  | "gemini"
  | "xai"
  | "openrouter"
  | "deepseek"
  | "kimi"
  | "qwen"
  | "minimax";

export interface ProviderInfo {
  name:           string;
  keyPlaceholder: string;
  fastModel:      string;
  capableModel:   string;
  baseURL?:       string;
}

export const PROVIDER_INFO: Record<AiProvider, ProviderInfo> = {
  anthropic: {
    name:           "Anthropic Claude",
    keyPlaceholder: "sk-ant-api03-…",
    fastModel:      "claude-haiku-4-5-20251001",
    capableModel:   "claude-sonnet-4-6",
  },
  openai: {
    name:           "OpenAI",
    keyPlaceholder: "sk-proj-…",
    fastModel:      "gpt-4o-mini",
    capableModel:   "gpt-4o",
  },
  gemini: {
    name:           "Google Gemini",
    keyPlaceholder: "AIzaSy…",
    fastModel:      "gemini-2.0-flash",
    capableModel:   "gemini-1.5-pro",
  },
  xai: {
    name:           "xAI Grok",
    keyPlaceholder: "xai-…",
    fastModel:      "grok-beta",
    capableModel:   "grok-2",
    baseURL:        "https://api.x.ai/v1",
  },
  openrouter: {
    name:           "OpenRouter",
    keyPlaceholder: "sk-or-v1-…",
    fastModel:      "openai/gpt-4o-mini",
    capableModel:   "openai/gpt-4o",
    baseURL:        "https://openrouter.ai/api/v1",
  },
  deepseek: {
    name:           "DeepSeek",
    keyPlaceholder: "sk-…",
    fastModel:      "deepseek-chat",
    capableModel:   "deepseek-chat",
    baseURL:        "https://api.deepseek.com",
  },
  kimi: {
    name:           "Kimi (Moonshot)",
    keyPlaceholder: "sk-…",
    fastModel:      "moonshot-v1-8k",
    capableModel:   "moonshot-v1-32k",
    baseURL:        "https://api.moonshot.cn/v1",
  },
  qwen: {
    name:           "Qwen (Alibaba)",
    keyPlaceholder: "sk-…",
    fastModel:      "qwen-turbo",
    capableModel:   "qwen-plus",
    baseURL:        "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  },
  minimax: {
    name:           "MiniMax",
    keyPlaceholder: "…",
    fastModel:      "abab6.5s-chat",
    capableModel:   "MiniMax-Text-01",
    baseURL:        "https://api.minimax.chat/v1",
  },
};

export const PROVIDER_LIST = Object.keys(PROVIDER_INFO) as AiProvider[];

// ── LLM factory ───────────────────────────────────────────────────────────

export function createFastLlm(
  provider: AiProvider,
  apiKey:   string,
  maxTokens = 350,
): BaseChatModel {
  const { fastModel, baseURL } = PROVIDER_INFO[provider];
  if (provider === "anthropic") {
    return new ChatAnthropic({ apiKey, model: fastModel, maxTokens });
  }
  if (provider === "gemini") {
    return new ChatGoogleGenerativeAI({ apiKey, model: fastModel, maxOutputTokens: maxTokens });
  }
  return new ChatOpenAI({
    apiKey,
    model:         fastModel,
    maxTokens,
    configuration: { baseURL },
  });
}

export function createCapableLlm(
  provider: AiProvider,
  apiKey:   string,
  maxTokens = 2000,
): BaseChatModel {
  const { capableModel, baseURL } = PROVIDER_INFO[provider];
  if (provider === "anthropic") {
    return new ChatAnthropic({ apiKey, model: capableModel, maxTokens });
  }
  if (provider === "gemini") {
    return new ChatGoogleGenerativeAI({ apiKey, model: capableModel, maxOutputTokens: maxTokens });
  }
  return new ChatOpenAI({
    apiKey,
    model:         capableModel,
    maxTokens,
    configuration: { baseURL },
  });
}

// ── Platform fallback (no user key) ───────────────────────────────────────

const PLATFORM_KEY      = process.env.ANTHROPIC_API_KEY ?? "";
const PLATFORM_PROVIDER: AiProvider = "anthropic";

export function isPlatformKey(key: string) {
  return !key || key === "build-placeholder";
}

export function resolveFastLlm(provider: AiProvider, apiKey: string, maxTokens = 350): BaseChatModel {
  if (isPlatformKey(apiKey)) {
    return createFastLlm(PLATFORM_PROVIDER, PLATFORM_KEY, maxTokens);
  }
  return createFastLlm(provider, apiKey, maxTokens);
}

export function resolveCapableLlm(provider: AiProvider, apiKey: string, maxTokens = 2000): BaseChatModel {
  if (isPlatformKey(apiKey)) {
    return createCapableLlm(PLATFORM_PROVIDER, PLATFORM_KEY, maxTokens);
  }
  return createCapableLlm(provider, apiKey, maxTokens);
}
