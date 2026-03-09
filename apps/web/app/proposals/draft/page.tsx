"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Bot, User, ArrowRight, Loader2, FileText, CheckCircle2,
  AlertCircle, Edit3, Send, ChevronDown, ChevronUp,
} from "lucide-react";
import type {
  CopilotResponse,
  ProposalDraft,
  JobBrief,
} from "@/lib/proposal-copilot/types";

// ── Demo job brief (in production this would come from URL params / SOW) ──

const DEMO_BRIEF: JobBrief = {
  title:    "DataSync Pipeline Automation Agent",
  summary:  "Deploy a Wasm-sandboxed agent that reconciles PostgreSQL ↔ S3 data pipelines, detects schema drift, and auto-retries failed batches with exponential backoff.",
  budget:   "$5,000",
  timeline: "~13 business days",
  skills:   ["rust", "wasm", "kafka", "postgres"],
  requirements: [
    "Tier 2 AiTalent installer (ZK biometric verified)",
    "Escrow held until 6-step DoD checklist complete",
    "7-day mechanic's warranty on all deployments",
    "Client provides DB credentials via secure vault",
  ],
};

// ── Types ──────────────────────────────────────────────────────────────────

interface Message {
  role:    "user" | "ai";
  content: string;
}

interface SubmitResult {
  proposal_id:   string;
  submitted_at:  string;
  notifications: {
    freelancer: { sent: boolean; email: string };
    client:     { sent: boolean; email: string };
  };
}

// ── Sidebar nav ────────────────────────────────────────────────────────────

const SIDEBAR_NAV = [
  { label: "Dashboard",   href: "/dashboard"  },
  { label: "Marketplace", href: "/marketplace"},
  { label: "Matching",    href: "/matching"   },
];

const AI_TOOLS_NAV = [
  { label: "Scoping",      href: "/scoping"       },
  { label: "Proposals",    href: "/proposals"     },
  { label: "Draft Proposal", href: "/proposals/draft", active: true },
  { label: "Pricing Tool", href: "/pricing-tool"  },
];

// ── BriefPanel ─────────────────────────────────────────────────────────────

function BriefPanel({ brief }: { brief: JobBrief }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-zinc-800 rounded-sm overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 bg-zinc-900 cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-400" />
          <span className="font-mono text-xs font-medium text-zinc-100 truncate">{brief.title}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="font-mono text-[10px] text-zinc-500">{brief.budget} · {brief.timeline}</span>
          {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />}
        </div>
      </div>
      {open && (
        <div className="px-4 py-3 space-y-3">
          <p className="font-mono text-xs text-zinc-400 leading-relaxed">{brief.summary}</p>
          <div className="flex flex-wrap gap-1">
            {brief.skills.map((s) => (
              <span key={s} className="font-mono text-[9px] border border-zinc-700 text-zinc-500 px-1.5 py-0.5 rounded-sm">
                {s}
              </span>
            ))}
          </div>
          <ul className="space-y-1">
            {brief.requirements.map((r, i) => (
              <li key={i} className="flex items-start gap-2 font-mono text-[10px] text-zinc-500">
                <CheckCircle2 className="w-3 h-3 text-zinc-700 flex-shrink-0 mt-0.5" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── DraftCard ──────────────────────────────────────────────────────────────

function DraftCard({ draft, onEdit }: { draft: ProposalDraft; onEdit: (d: ProposalDraft) => void }) {
  const [editing,     setEditing]     = useState<keyof ProposalDraft | null>(null);
  const [local,       setLocal]       = useState<ProposalDraft>(draft);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function save(field: keyof ProposalDraft, value: string | string[]) {
    const updated = { ...local, [field]: value };
    setLocal(updated);
    onEdit(updated);
    setEditing(null);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/proposals/submit", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ draft: local, job_brief: DEMO_BRIEF }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setSubmitResult(await res.json() as SubmitResult);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitResult) {
    return (
      <div className="border border-green-900 bg-green-950/20 rounded-sm p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
          <p className="font-mono text-sm font-medium text-green-300">Proposal Submitted</p>
        </div>

        <div className="font-mono text-[10px] text-zinc-600 space-y-0.5">
          <p>ID: <span className="text-zinc-400">{submitResult.proposal_id}</span></p>
          <p>At: <span className="text-zinc-400">{new Date(submitResult.submitted_at).toLocaleString()}</span></p>
        </div>

        {/* Notification status */}
        <div className="border border-zinc-800 rounded-sm divide-y divide-zinc-800">
          {(["freelancer", "client"] as const).map((party) => {
            const n = submitResult.notifications[party];
            return (
              <div key={party} className="flex items-center justify-between px-3 py-2">
                <div>
                  <p className="font-mono text-[10px] text-zinc-400 capitalize">{party}</p>
                  <p className="font-mono text-[9px] text-zinc-600">{n.email}</p>
                </div>
                <span className={`font-mono text-[10px] font-medium ${n.sent ? "text-green-400" : "text-amber-500"}`}>
                  {n.sent ? "✓ Notified" : "~ Offline"}
                </span>
              </div>
            );
          })}
        </div>

        <p className="font-mono text-xs text-zinc-500">
          Your proposal is visible to the client and will be scored by the AI review engine.
        </p>
        <Link href="/proposals"
          className="flex items-center gap-2 px-4 py-2 border border-zinc-700 rounded-sm
                     font-mono text-xs text-zinc-300 hover:border-zinc-500 transition-colors w-fit">
          View All Proposals <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="border border-amber-900 rounded-sm overflow-hidden">
      {/* header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-zinc-900 border-b border-zinc-800">
        <FileText className="w-4 h-4 text-amber-400" />
        <div>
          <p className="font-mono text-xs font-medium text-zinc-100">AI-Drafted Proposal</p>
          <p className="font-mono text-[10px] text-zinc-500">{local.proposed_budget} · {local.proposed_timeline} · click any field to edit</p>
        </div>
      </div>

      <div className="divide-y divide-zinc-800">
        {/* Cover letter */}
        <DraftField
          label="Cover Letter"
          value={local.cover_letter}
          editing={editing === "cover_letter"}
          multiline
          onEdit={() => setEditing("cover_letter")}
          onSave={(v) => save("cover_letter", v)}
          onCancel={() => setEditing(null)}
        />

        {/* Technical approach */}
        <DraftField
          label="Technical Approach"
          value={local.technical_approach}
          editing={editing === "technical_approach"}
          multiline
          onEdit={() => setEditing("technical_approach")}
          onSave={(v) => save("technical_approach", v)}
          onCancel={() => setEditing(null)}
        />

        {/* Key deliverables */}
        <div className="px-4 py-3">
          <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Key Deliverables</p>
          <ul className="space-y-1.5">
            {local.key_deliverables.map((d, i) => (
              <li key={i} className="flex items-start gap-2 font-mono text-xs text-zinc-300">
                <CheckCircle2 className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                {d}
              </li>
            ))}
          </ul>
        </div>

        {/* Why me */}
        <DraftField
          label="Why Me"
          value={local.why_me}
          editing={editing === "why_me"}
          onEdit={() => setEditing("why_me")}
          onSave={(v) => save("why_me", v)}
          onCancel={() => setEditing(null)}
        />

        {/* Budget + timeline */}
        <div className="px-4 py-3 grid grid-cols-2 gap-4">
          <div>
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Proposed Budget</p>
            <p className="font-mono text-sm font-bold text-amber-400">{local.proposed_budget}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Timeline</p>
            <p className="font-mono text-xs text-zinc-300">{local.proposed_timeline}</p>
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="px-4 py-4 border-t border-zinc-800 space-y-2">
        {submitError && (
          <div className="flex items-center gap-2 border border-red-900 bg-red-950/30 rounded-sm px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <p className="font-mono text-[10px] text-red-400">{submitError}</p>
          </div>
        )}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 h-10 rounded-sm
                     border border-amber-900 bg-amber-950 text-amber-400
                     font-mono text-xs uppercase tracking-widest
                     hover:border-amber-700 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting…</>
            : <><Send className="w-3.5 h-3.5" /> Submit Proposal</>
          }
        </button>
        <p className="font-mono text-[10px] text-zinc-600 text-center">
          Proposal will be scored by the AI review engine before the client sees it
        </p>
      </div>
    </div>
  );
}

// ── DraftField ─────────────────────────────────────────────────────────────

function DraftField({
  label, value, editing, multiline = false,
  onEdit, onSave, onCancel,
}: {
  label:     string;
  value:     string;
  editing:   boolean;
  multiline?: boolean;
  onEdit:    () => void;
  onSave:    (v: string) => void;
  onCancel:  () => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">{label}</p>
        {!editing && (
          <button onClick={onEdit} className="flex items-center gap-1 font-mono text-[10px] text-zinc-600 hover:text-zinc-300">
            <Edit3 className="w-3 h-3" /> Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          {multiline ? (
            <textarea
              className="w-full bg-zinc-900 border border-zinc-700 rounded-sm font-mono text-xs
                         text-zinc-200 p-2 resize-none focus:outline-none focus:border-zinc-500"
              rows={4}
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              autoFocus
            />
          ) : (
            <input
              className="w-full bg-zinc-900 border border-zinc-700 rounded-sm font-mono text-xs
                         text-zinc-200 px-2 py-1.5 focus:outline-none focus:border-zinc-500"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              autoFocus
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={() => onSave(local)}
              className="px-3 py-1 bg-amber-950 border border-amber-800 text-amber-400
                         font-mono text-[10px] rounded-sm hover:border-amber-600 transition-colors"
            >
              Save
            </button>
            <button
              onClick={onCancel}
              className="px-3 py-1 border border-zinc-700 text-zinc-500
                         font-mono text-[10px] rounded-sm hover:border-zinc-500 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{value}</p>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ProposalDraftPage() {
  const [messages,   setMessages]   = useState<Message[]>([
    {
      role:    "ai",
      content: "I'm your Proposal Copilot. I'll ask you 3 quick questions to personalise your proposal, then generate a complete draft you can edit and submit.",
    },
  ]);
  const [input,      setInput]      = useState("");
  const [phase,      setPhase]      = useState(0);   // 0-2 = intake, 3 = draft ready
  const [thinking,   setThinking]   = useState(false);
  const [draft,      setDraft]      = useState<ProposalDraft | null>(null);
  const [apiError,   setApiError]   = useState<string | null>(null);
  const [sessionId]                 = useState(() => crypto.randomUUID());
  const [activeTab,  setActiveTab]  = useState<"copilot" | "brief">("copilot");
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
      const res = await fetch("/api/proposal-copilot", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          session_id: sessionId,
          message:    trimmed,
          // Send brief on every call so server can attach it if session was reset
          job_brief: DEMO_BRIEF,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data: CopilotResponse = await res.json();

      setMessages((m) => [...m, { role: "ai", content: data.reply }]);
      setPhase(data.phase);
      if (data.draft) setDraft(data.draft);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setApiError(msg);
      setMessages((m) => [
        ...m,
        {
          role:    "ai",
          content: "I hit an error. Make sure ANTHROPIC_API_KEY is set in .env.local.",
        },
      ]);
    } finally {
      setThinking(false);
    }
  }

  const phaseLabel =
    phase >= 3
      ? "Draft complete — review & submit"
      : `Question ${phase + 1} of 3`;

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-zinc-800 p-4 gap-6">
        <span className="font-mono text-xs text-zinc-500 uppercase tracking-widest">AiStaffApp</span>
        <nav className="flex flex-col gap-1">
          {SIDEBAR_NAV.map(({ label, href }) => (
            <Link key={label} href={href}
              className="px-3 py-2 rounded-sm font-mono text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
            >{label}</Link>
          ))}
        </nav>
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-700 uppercase tracking-widest px-3">AI Tools</p>
          {AI_TOOLS_NAV.map(({ label, href, active }) => (
            <Link key={label} href={href}
              className={`block px-3 py-1.5 rounded-sm font-mono text-xs transition-colors ${
                active ? "text-zinc-100 bg-zinc-800" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >{label}</Link>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col lg:flex-row min-w-0 pb-20 lg:pb-0">

        {/* ── Left: Job Brief (desktop always visible, mobile tab) ── */}
        <div className={`lg:w-80 lg:border-r lg:border-zinc-800 lg:block p-4 space-y-4
                         ${activeTab === "brief" ? "block" : "hidden lg:block"}`}>
          <div>
            <h2 className="font-mono text-xs font-medium text-zinc-300 mb-1">Job Brief</h2>
            <p className="font-mono text-[10px] text-zinc-600">Read the brief before answering the copilot&apos;s questions.</p>
          </div>
          <BriefPanel brief={DEMO_BRIEF} />
        </div>

        {/* ── Right: Copilot + Draft ── */}
        <div className={`flex-1 flex flex-col min-w-0
                         ${activeTab === "copilot" || activeTab === "brief" ? "flex" : "hidden lg:flex"}`}>

          {/* Header */}
          <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-sm bg-amber-500/10 border border-amber-800 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-mono text-sm font-medium text-zinc-200">Proposal Copilot</p>
              <p className="font-mono text-[10px] text-zinc-600">{phaseLabel}</p>
            </div>
            {/* Progress dots */}
            <div className="flex items-center gap-1 shrink-0">
              {[0, 1, 2].map((i) => (
                <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i < phase ? "bg-amber-500" : i === phase ? "bg-amber-400" : "bg-zinc-700"
                }`} />
              ))}
            </div>
          </div>

          {/* Error banner */}
          {apiError && (
            <div className="mx-4 mt-3 flex items-center gap-2 border border-red-900 bg-red-950/30 rounded-sm px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <p className="font-mono text-[10px] text-red-400">{apiError}</p>
            </div>
          )}

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-7 h-7 rounded-sm shrink-0 flex items-center justify-center border ${
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

            {/* Thinking */}
            {thinking && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-sm shrink-0 flex items-center justify-center border bg-amber-500/10 border-amber-800">
                  <Bot className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="px-3 py-2 rounded-sm border border-zinc-800 bg-zinc-900 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                  <span className="font-mono text-[10px] text-zinc-600">
                    {phase >= 3 ? "Drafting your proposal…" : "Thinking…"}
                  </span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input area — hidden once draft is ready */}
          {phase < 3 && (
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
                  placeholder="Your answer…"
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
              <p className="font-mono text-[10px] text-zinc-700 mt-1.5">Enter to send · Shift+Enter for new line</p>
            </div>
          )}

          {/* Generated draft */}
          {draft && (
            <div className="p-4 border-t border-zinc-800">
              <DraftCard draft={draft} onEdit={setDraft} />
            </div>
          )}
        </div>
      </main>

      {/* Mobile tab bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-16 flex items-center
                      border-t border-zinc-800 bg-zinc-950">
        {[
          { label: "Brief",   tab: "brief"   as const },
          { label: "Copilot", tab: "copilot" as const },
        ].map(({ label, tab }) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 font-mono text-[10px] transition-colors ${
              activeTab === tab ? "text-amber-400" : "text-zinc-600"
            }`}
          >
            {label}
          </button>
        ))}
        {[
          { label: "Dash",    href: "/dashboard"  },
          { label: "Market",  href: "/marketplace"},
          { label: "Profile", href: "/profile"    },
        ].map(({ label, href }) => (
          <Link key={label} href={href} className="nav-tab">
            <span className="text-[10px]">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
