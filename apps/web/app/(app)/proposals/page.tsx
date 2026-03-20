"use client";

import { useState } from "react";
import Link from "next/link";
import { Filter, X, CheckCircle2, AlertTriangle, Star } from "lucide-react";
import { AppSidebar, AppMobileNav } from "@/components/AppSidebar";
import { SubScoreBar } from "@/components/SubScoreBar";
import { VettingBadge } from "@/components/VettingBadge";

// ── Demo data ──────────────────────────────────────────────────────────────────

interface Proposal {
  id:             string;
  talent_name:    string;
  talent_title:   string;
  identity_tier:  0 | 1 | 2;
  submitted_at:   string;
  rate_cents:     number;
  cover_length:   number;     // word count
  // AI scores 0–100
  overall_score:         number;
  brief_understanding:   number;
  portfolio_relevance:   number;
  price_fit:             number;
  originality:           number;
  // flags
  ai_generated_likely:   boolean;
  top_pick:              boolean;
  cover_snippet:         string;
  portfolio_link:        string;
}

const DEMO_PROPOSALS: Proposal[] = [
  {
    id: "prop-001",
    talent_name:  "Marcus T.",
    talent_title: "Senior Rust / Wasm Engineer",
    identity_tier: 2,
    submitted_at: "2h ago",
    rate_cents:   18500,
    cover_length: 312,
    overall_score:        94,
    brief_understanding:  96,
    portfolio_relevance:  92,
    price_fit:            89,
    originality:          98,
    ai_generated_likely:  false,
    top_pick:             true,
    cover_snippet: "I noticed your brief specifically calls out Kafka consumer lag and schema drift — I've solved both in production for two FinTech clients. My DataSync agent (linked below) reduced reconciliation time by 42%…",
    portfolio_link: "#",
  },
  {
    id: "prop-002",
    talent_name:  "Lena K.",
    talent_title: "ML Systems Architect",
    identity_tier: 2,
    submitted_at: "3h ago",
    rate_cents:   21000,
    cover_length: 287,
    overall_score:        88,
    brief_understanding:  91,
    portfolio_relevance:  86,
    price_fit:            81,
    originality:          94,
    ai_generated_likely:  false,
    top_pick:             true,
    cover_snippet: "The latency requirement you mentioned (sub-100ms p99) aligns exactly with the streaming pipeline I shipped for a health-tech API last quarter. I can walk you through the architecture on a call before we proceed…",
    portfolio_link: "#",
  },
  {
    id: "prop-003",
    talent_name:  "Diego R.",
    talent_title: "DevOps + Wasm Specialist",
    identity_tier: 1,
    submitted_at: "5h ago",
    rate_cents:   9500,
    cover_length: 198,
    overall_score:        76,
    brief_understanding:  78,
    portfolio_relevance:  74,
    price_fit:            88,
    originality:          68,
    ai_generated_likely:  false,
    top_pick:             true,
    cover_snippet: "I've deployed 9 Wasm agents over the past 18 months and understand the DoD checklist requirements well. My rate is competitive and I can start within 3 business days…",
    portfolio_link: "#",
  },
  {
    id: "prop-004",
    talent_name:  "Jordan B.",
    talent_title: "Full Stack Developer",
    identity_tier: 1,
    submitted_at: "6h ago",
    rate_cents:   12000,
    cover_length: 89,
    overall_score:        52,
    brief_understanding:  44,
    portfolio_relevance:  55,
    price_fit:            72,
    originality:          38,
    ai_generated_likely:  false,
    top_pick:             false,
    cover_snippet: "I have extensive experience in software development and can handle this project. I am proficient in multiple technologies and have delivered many successful projects on time…",
    portfolio_link: "#",
  },
  {
    id: "prop-005",
    talent_name:  "Chris V.",
    talent_title: "Backend Engineer",
    identity_tier: 0,
    submitted_at: "7h ago",
    rate_cents:   8000,
    cover_length: 61,
    overall_score:        31,
    brief_understanding:  22,
    portfolio_relevance:  28,
    price_fit:            65,
    originality:          12,
    ai_generated_likely:  true,
    top_pick:             false,
    cover_snippet: "I am highly skilled and experienced professional who can deliver this project with high quality. I have worked on similar projects and understand the requirements…",
    portfolio_link: "#",
  },
  {
    id: "prop-006",
    talent_name:  "Alex P.",
    talent_title: "Software Developer",
    identity_tier: 0,
    submitted_at: "8h ago",
    rate_cents:   6500,
    cover_length: 44,
    overall_score:        18,
    brief_understanding:  15,
    portfolio_relevance:  12,
    price_fit:            55,
    originality:          8,
    ai_generated_likely:  true,
    top_pick:             false,
    cover_snippet: "I can complete this project within timeline and budget. I have the required skills and experience. Please review my portfolio and let me know if you want to proceed…",
    portfolio_link: "#",
  },
];


// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtRate(c: number) { return `$${(c / 100).toFixed(0)}/hr`; }

function scoreColor(s: number): "green" | "amber" | "red" {
  if (s >= 70) return "green";
  if (s >= 45) return "amber";
  return "red";
}

function scoreTextColor(s: number) {
  if (s >= 70) return "text-green-400";
  if (s >= 45) return "text-amber-400";
  return "text-red-400";
}

// ── ProposalRow ───────────────────────────────────────────────────────────────

function ProposalRow({ p, onSelect }: { p: Proposal; onSelect: (p: Proposal) => void }) {
  return (
    <button
      onClick={() => onSelect(p)}
      className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-b border-zinc-800 last:border-0 hover:bg-zinc-900 ${
        p.top_pick ? "bg-zinc-900/40" : ""
      }`}
    >
      {/* Rank / score circle */}
      <div className={`w-9 h-9 rounded-sm border flex items-center justify-center flex-shrink-0 ${
        p.top_pick
          ? "border-green-800 bg-green-950/30"
          : p.ai_generated_likely
          ? "border-red-900 bg-red-950/20"
          : "border-zinc-800"
      }`}>
        <span className={`font-mono text-sm font-medium tabular-nums ${scoreTextColor(p.overall_score)}`}>
          {p.overall_score}
        </span>
      </div>

      {/* Name + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs font-medium text-zinc-100">{p.talent_name}</span>
          <VettingBadge tier={p.identity_tier} compact />
          {p.top_pick && (
            <span className="font-mono text-[9px] border border-green-800 text-green-400 px-1.5 py-0.5 rounded-sm flex items-center gap-1">
              <Star className="w-2.5 h-2.5" />TOP PICK
            </span>
          )}
          {p.ai_generated_likely && (
            <span className="font-mono text-[9px] border border-red-900 text-red-400 px-1.5 py-0.5 rounded-sm flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5" />AI-SPAM LIKELY
            </span>
          )}
        </div>
        <p className="font-mono text-[10px] text-zinc-500 mt-0.5 truncate">{p.talent_title}</p>
        <p className="font-mono text-[10px] text-zinc-600 mt-1 line-clamp-1 italic">{p.cover_snippet.slice(0, 80)}…</p>
      </div>

      {/* Rate + time */}
      <div className="text-right flex-shrink-0 hidden sm:block">
        <p className="font-mono text-xs text-zinc-300">{fmtRate(p.rate_cents)}</p>
        <p className="font-mono text-[10px] text-zinc-600">{p.submitted_at}</p>
      </div>
    </button>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({ p, onClose }: { p: Proposal; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-zinc-950/80 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="w-full max-w-sm bg-zinc-950 border-l border-zinc-800 flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
          <div className="flex-1 min-w-0">
            <p className="font-mono text-xs font-medium text-zinc-100">{p.talent_name}</p>
            <p className="font-mono text-[10px] text-zinc-500 truncate">{p.talent_title}</p>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Overall score */}
          <div className="text-center py-2">
            <p className={`font-mono text-4xl font-medium tabular-nums ${scoreTextColor(p.overall_score)}`}>
              {p.overall_score}
            </p>
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mt-1">Overall AI Score</p>
            {p.top_pick && (
              <span className="inline-flex items-center gap-1 mt-2 font-mono text-[10px] border border-green-800 text-green-400 px-2 py-0.5 rounded-sm">
                <Star className="w-2.5 h-2.5" />Top 3 Candidate
              </span>
            )}
            {p.ai_generated_likely && (
              <span className="inline-flex items-center gap-1 mt-2 font-mono text-[10px] border border-red-900 text-red-400 px-2 py-0.5 rounded-sm">
                <AlertTriangle className="w-2.5 h-2.5" />AI-Generated Likely
              </span>
            )}
          </div>

          {/* Score breakdown */}
          <div className="space-y-2">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Score Breakdown</p>
            <SubScoreBar label="Brief Understanding"  score={p.brief_understanding}  color={scoreColor(p.brief_understanding)} />
            <SubScoreBar label="Portfolio Relevance"  score={p.portfolio_relevance}  color={scoreColor(p.portfolio_relevance)} />
            <SubScoreBar label="Price Fit"            score={p.price_fit}            color={scoreColor(p.price_fit)} />
            <SubScoreBar label="Originality"          score={p.originality}          color={scoreColor(p.originality)} />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Rate",         value: fmtRate(p.rate_cents) },
              { label: "Cover Length", value: `${p.cover_length} words` },
              { label: "Submitted",    value: p.submitted_at },
              { label: "Identity",     value: `Tier ${p.identity_tier}` },
            ].map(({ label, value }) => (
              <div key={label} className="border border-zinc-800 rounded-sm p-2 bg-zinc-900">
                <p className="font-mono text-[10px] text-zinc-600 uppercase">{label}</p>
                <p className="font-mono text-xs text-zinc-300 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Cover snippet */}
          <div className="border border-zinc-800 rounded-sm p-3 bg-zinc-900/50">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Cover Letter Excerpt</p>
            <p className="font-mono text-xs text-zinc-400 leading-relaxed italic">&ldquo;{p.cover_snippet}&rdquo;</p>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <button className="w-full h-10 rounded-sm border border-amber-900 bg-amber-950 text-amber-400
                               font-mono text-xs uppercase tracking-widest hover:border-amber-700 transition-colors flex items-center justify-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Shortlist Candidate
            </button>
            {p.ai_generated_likely ? (
              <button className="w-full h-9 rounded-sm border border-red-900 text-red-400
                                 font-mono text-xs uppercase tracking-widest hover:border-red-700 transition-colors">
                Flag as Spam
              </button>
            ) : (
              <button className="w-full h-9 rounded-sm border border-zinc-700 text-zinc-400
                                 font-mono text-xs uppercase tracking-widest hover:border-zinc-500 hover:text-zinc-300 transition-colors">
                Request Interview
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ProposalsPage() {
  const [selected,     setSelected]     = useState<Proposal | null>(null);
  const [showSpam,     setShowSpam]     = useState(false);
  const [tierFilter,   setTierFilter]   = useState<"all" | "2" | "1" | "0">("all");

  const sorted = [...DEMO_PROPOSALS].sort((a, b) => b.overall_score - a.overall_score);
  const visible = sorted
    .filter((p) => showSpam || !p.ai_generated_likely)
    .filter((p) => tierFilter === "all" || p.identity_tier === Number(tierFilter));

  const topPicks   = visible.filter((p) => p.top_pick).length;
  const spamCount  = DEMO_PROPOSALS.filter((p) => p.ai_generated_likely).length;

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <AppSidebar />

      <main className="flex-1 pb-20 lg:pb-0 max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-start gap-3">
          <div className="flex-1">
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
              Proposal Scoring
            </h1>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">
              {DEMO_PROPOSALS.length} proposals · {topPicks} top picks · {spamCount} AI-spam filtered
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/proposals/draft"
              className="flex items-center gap-1.5 h-8 px-3 rounded-sm border border-amber-900
                         bg-amber-950 text-amber-400 font-mono text-[10px]
                         hover:border-amber-700 transition-colors whitespace-nowrap"
            >
              + Draft Proposal
            </Link>
            <Filter className="w-4 h-4 text-zinc-600" />
          </div>
        </div>

        {/* Filters */}
        <div className="px-4 py-2 border-b border-zinc-800 flex flex-wrap items-center gap-2">
          {/* Tier filter */}
          <div className="flex items-center gap-1">
            {(["all", "2", "1", "0"] as const).map((t) => (
              <button key={t}
                onClick={() => setTierFilter(t)}
                className={`font-mono text-[10px] px-2 py-1 rounded-sm border transition-colors ${
                  tierFilter === t
                    ? "border-amber-800 bg-amber-950 text-amber-400"
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-600"
                }`}
              >
                {t === "all" ? "All Tiers" : `Tier ${t}`}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowSpam((v) => !v)}
            className={`ml-auto font-mono text-[10px] px-2 py-1 rounded-sm border transition-colors ${
              showSpam
                ? "border-red-900 bg-red-950/30 text-red-400"
                : "border-zinc-800 text-zinc-600 hover:border-zinc-600"
            }`}
          >
            {showSpam ? "Hide spam" : `Show ${spamCount} AI-spam`}
          </button>
        </div>

        {/* Proposals list */}
        <div className="border-b border-zinc-800">
          {visible.map((p) => (
            <ProposalRow key={p.id} p={p} onSelect={setSelected} />
          ))}
        </div>

        {/* Legend */}
        <div className="p-4 grid grid-cols-2 gap-2">
          <div className="border border-green-900/40 rounded-sm p-2 bg-green-950/10">
            <div className="flex items-center gap-1.5 mb-1">
              <Star className="w-3 h-3 text-green-400" />
              <p className="font-mono text-[10px] text-green-400 uppercase tracking-widest">Top Pick</p>
            </div>
            <p className="font-mono text-[10px] text-zinc-500">Score ≥ 70 · Read the brief · Relevant portfolio</p>
          </div>
          <div className="border border-red-900/40 rounded-sm p-2 bg-red-950/10">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-3 h-3 text-red-400" />
              <p className="font-mono text-[10px] text-red-400 uppercase tracking-widest">AI-Spam Likely</p>
            </div>
            <p className="font-mono text-[10px] text-zinc-500">Generic cover · No brief references · Low originality</p>
          </div>
        </div>
      </main>

      {/* Detail panel */}
      {selected && <DetailPanel p={selected} onClose={() => setSelected(null)} />}

      <AppMobileNav />
    </div>
  );
}
