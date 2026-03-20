"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Bot, User, ArrowRight, Loader2, Download, CheckCircle2,
  ClipboardList, Brain, AlertCircle,
} from "lucide-react";
import { VettingBadge } from "@/components/VettingBadge";
import type { PMAgentResponse, MatchCandidate, Sow } from "@/lib/pm-agent/types";

// ── Types ─────────────────────────────────────────────────────────────────

interface Message {
  role:    "user" | "ai";
  content: string;
}

// ── FreelancerRow ──────────────────────────────────────────────────────────

function FreelancerRow({
  candidate,
  rank,
}: {
  candidate: MatchCandidate;
  rank:      number;
}) {
  const availColor = {
    available:   "text-green-400 border-green-800",
    limited:     "text-amber-400 border-amber-800",
    unavailable: "text-zinc-500 border-zinc-700",
  }[candidate.availability];

  const scoreColor =
    candidate.match_score >= 0.8
      ? "text-green-400"
      : candidate.match_score >= 0.6
      ? "text-amber-400"
      : "text-zinc-500";

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-900 transition-colors">
      <span className="font-mono text-xs text-zinc-600 w-4 flex-shrink-0">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-mono text-xs font-medium text-zinc-100 truncate">{candidate.name}</p>
          <VettingBadge tier={candidate.identity_tier} compact />
        </div>
        <p className="font-mono text-[10px] text-zinc-500 truncate mt-0.5">{candidate.title}</p>
      </div>
      <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
        {candidate.skill_tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="font-mono text-[9px] border border-zinc-800 text-zinc-500 px-1 py-0.5 rounded-sm"
          >
            {tag}
          </span>
        ))}
      </div>
      <span
        className={`font-mono text-[9px] border px-1.5 py-0.5 rounded-sm flex-shrink-0 ${availColor}`}
      >
        {candidate.availability}
      </span>
      <span className={`font-mono text-sm font-medium tabular-nums flex-shrink-0 ${scoreColor}`}>
        {(candidate.match_score * 100).toFixed(0)}%
      </span>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ScopingPage() {
  const [messages,    setMessages]    = useState<Message[]>([
    {
      role:    "ai",
      content: "Hi! I'm the AiStaff AI Project Manager. Describe what you're trying to build or automate — even a rough idea is fine. I'll help turn it into a structured Statement of Work.",
    },
  ]);
  const [input,       setInput]       = useState("");
  const [phase,       setPhase]       = useState<number>(0);
  const [thinking,    setThinking]    = useState(false);
  const [sow,         setSow]         = useState<Sow | null>(null);
  const [freelancers, setFreelancers] = useState<MatchCandidate[]>([]);
  const [apiError,    setApiError]    = useState<string | null>(null);
  const [sessionId]                   = useState<string>(() => crypto.randomUUID());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || thinking) return;

    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    setInput("");
    setThinking(true);
    setApiError(null);

    try {
      const userApiKey   = localStorage.getItem("aistaff_ai_key") ?? "";
      const userProvider = localStorage.getItem("aistaff_ai_provider") ?? "anthropic";
      const res = await fetch("/api/pm-agent", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          ...(userApiKey   ? { "x-user-api-key":      userApiKey   } : {}),
          ...(userProvider ? { "x-user-ai-provider":  userProvider } : {}),
        },
        body:    JSON.stringify({ session_id: sessionId, message: trimmed }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data: PMAgentResponse = await res.json();

      setMessages((m) => [...m, { role: "ai", content: data.reply }]);
      setPhase(data.phase);
      if (data.sow)         setSow(data.sow);
      if (data.freelancers?.length) setFreelancers(data.freelancers);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setApiError(msg);
      setMessages((m) => [
        ...m,
        {
          role:    "ai",
          content: `I encountered an error. Make sure \`ANTHROPIC_API_KEY\` is set in \`.env.local\` and the dev server was restarted.`,
        },
      ]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      {/* Main */}
      <main className="flex-1 flex flex-col pb-20 lg:pb-0 max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-amber-500/10 border border-amber-800 flex items-center justify-center">
            <Bot className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="font-mono text-sm font-medium text-zinc-200">AI PM Agent</p>
            <p className="font-mono text-[10px] text-zinc-600">
              {phase < 5
                ? `Step ${Math.min(phase + 1, 5)} of 5 — ${phase === 0 ? "Describe your brief" : `Question ${phase} of 4`}`
                : "SOW generated · matching complete"}
            </p>
          </div>
          {/* Progress dots */}
          <div className="ml-auto flex items-center gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i < phase ? "bg-amber-500" : i === phase ? "bg-amber-400" : "bg-zinc-700"
              }`} />
            ))}
          </div>
        </div>

        {/* API error banner */}
        {apiError && (
          <div className="mx-4 mt-3 flex items-center gap-2 border border-red-900 bg-red-950/30 rounded-sm px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            <p className="font-mono text-[10px] text-red-400">{apiError}</p>
          </div>
        )}

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-7 h-7 rounded-sm flex-shrink-0 flex items-center justify-center border ${
                msg.role === "ai"
                  ? "bg-amber-500/10 border-amber-800"
                  : "bg-zinc-800 border-zinc-700"
              }`}>
                {msg.role === "ai"
                  ? <Bot className="w-3.5 h-3.5 text-amber-400" />
                  : <User className="w-3.5 h-3.5 text-zinc-400" />
                }
              </div>
              <div className={`max-w-[80%] px-3 py-2 rounded-sm border font-mono text-xs leading-relaxed ${
                msg.role === "ai"
                  ? "bg-zinc-900 border-zinc-800 text-zinc-300"
                  : "bg-zinc-800 border-zinc-700 text-zinc-200"
              }`}>
                {msg.content}
              </div>
            </div>
          ))}

          {/* Thinking indicator */}
          {thinking && (
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-sm flex-shrink-0 flex items-center justify-center border bg-amber-500/10 border-amber-800">
                <Bot className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="px-3 py-2 rounded-sm border border-zinc-800 bg-zinc-900 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                <span className="font-mono text-[10px] text-zinc-600">Thinking…</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        {phase < 5 && (
          <div className="p-4 border-t border-zinc-800">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                disabled={thinking}
                placeholder={phase === 0 ? "Describe what you want to build…" : "Your answer…"}
                rows={2}
                className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-sm font-mono text-xs
                           text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600
                           resize-none transition-colors disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || thinking}
                className="h-auto px-4 rounded-sm border border-amber-900 bg-amber-950 text-amber-400
                           font-mono text-xs flex items-center gap-1.5 hover:border-amber-700 transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <p className="font-mono text-[10px] text-zinc-700 mt-1.5">
              Press Enter to send · Shift+Enter for new line
            </p>
          </div>
        )}

        {/* Generated SOW */}
        {sow && (
          <div className="m-4 border border-green-900 rounded-sm bg-zinc-950 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900">
              <ClipboardList className="w-4 h-4 text-green-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-xs font-medium text-zinc-100 truncate">{sow.title}</p>
                <p className="font-mono text-[10px] text-zinc-500 mt-0.5">
                  {sow.timeline} · {sow.total_budget} total
                </p>
              </div>
              <button className="flex items-center gap-1.5 h-8 px-3 border border-zinc-700 rounded-sm
                                 font-mono text-[10px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-colors">
                <Download className="w-3 h-3" />
                Export
              </button>
            </div>

            <div className="px-4 py-3 border-b border-zinc-800">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Summary</p>
              <p className="font-mono text-xs text-zinc-400 leading-relaxed">{sow.summary}</p>
            </div>

            <div className="px-4 py-3 border-b border-zinc-800">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Milestones</p>
              <div className="space-y-2">
                {sow.milestones.map((m, i) => (
                  <div key={i} className="border border-zinc-800 rounded-sm p-2.5 grid grid-cols-1 sm:grid-cols-3 gap-1">
                    <div className="sm:col-span-2">
                      <p className="font-mono text-xs text-amber-400">{m.phase}</p>
                      <p className="font-mono text-[10px] text-zinc-400 mt-0.5 leading-relaxed">{m.deliverable}</p>
                    </div>
                    <div className="flex sm:flex-col sm:items-end gap-3 sm:gap-1">
                      <span className="font-mono text-[10px] text-zinc-500">{m.timeline}</span>
                      <span className="font-mono text-sm font-medium text-zinc-200">{m.price}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-4 py-3">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Requirements</p>
              <ul className="space-y-1.5">
                {sow.requirements.map((req, i) => (
                  <li key={i} className="flex items-start gap-2 font-mono text-[10px] text-zinc-400">
                    <CheckCircle2 className="w-3 h-3 text-zinc-600 flex-shrink-0 mt-0.5" />
                    {req}
                  </li>
                ))}
              </ul>
              <Link
                href="/marketplace"
                className="flex items-center justify-center gap-2 mt-4 h-10 rounded-sm border border-amber-900
                           bg-amber-950 text-amber-400 font-mono text-xs uppercase tracking-widest
                           hover:border-amber-700 transition-colors"
              >
                Post to Marketplace <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        {/* Top Matched Installers */}
        {freelancers.length > 0 && (
          <div className="mx-4 mb-4 border border-zinc-800 rounded-sm bg-zinc-950 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900">
              <Brain className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <div>
                <p className="font-mono text-xs font-medium text-zinc-100">Top Matched Installers</p>
                <p className="font-mono text-[10px] text-zinc-500 mt-0.5">
                  {freelancers.length} candidates · ranked by match score · PoH-verified
                </p>
              </div>
            </div>
            <div className="divide-y divide-zinc-800">
              {freelancers.map((f, i) => (
                <FreelancerRow key={f.id} candidate={f} rank={i + 1} />
              ))}
            </div>
            <div className="px-4 py-3 border-t border-zinc-800">
              <Link
                href="/matching"
                className="flex items-center justify-center gap-2 h-9 rounded-sm border border-zinc-700
                           text-zinc-400 font-mono text-xs hover:border-zinc-500 hover:text-zinc-300 transition-colors"
              >
                View Full Matching Engine <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
