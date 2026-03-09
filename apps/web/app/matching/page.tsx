"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Brain, ChevronDown, ChevronUp, Zap,
  Code2, Database, Cpu, Globe,
  CheckCircle2, AlertCircle,
} from "lucide-react";
import { SubScoreBar } from "@/components/SubScoreBar";
import { VettingBadge } from "@/components/VettingBadge";

// ── Demo data ──────────────────────────────────────────────────────────────────

interface MatchCandidate {
  id:             string;
  name:           string;
  title:          string;
  location:       string;
  trust_score:    number;
  identity_tier:  0 | 1 | 2;
  match_score:    number;   // 0–1
  skills_score:   number;   // 0–100
  past_work_score:number;   // 0–100
  behavior_score: number;   // 0–100
  skill_tags:     string[];
  rate_cents:     number;   // hourly, per-hour
  availability:   "available" | "limited" | "unavailable";
  deployments:    number;
}

const DEMO_CANDIDATES: MatchCandidate[] = [
  {
    id:              "tal-001",
    name:            "Marcus T.",
    title:           "Senior Rust / Wasm Engineer",
    location:        "Berlin, DE",
    trust_score:     94,
    identity_tier:   2,
    match_score:     0.94,
    skills_score:    97,
    past_work_score: 91,
    behavior_score:  93,
    skill_tags:      ["rust", "wasm", "kafka", "postgres"],
    rate_cents:      18500,
    availability:    "available",
    deployments:     24,
  },
  {
    id:              "tal-002",
    name:            "Lena K.",
    title:           "ML Systems Architect",
    location:        "Amsterdam, NL",
    trust_score:     88,
    identity_tier:   2,
    match_score:     0.87,
    skills_score:    89,
    past_work_score: 86,
    behavior_score:  85,
    skill_tags:      ["rust", "mlops", "kafka"],
    rate_cents:      21000,
    availability:    "available",
    deployments:     17,
  },
  {
    id:              "tal-003",
    name:            "Diego R.",
    title:           "DevOps + Wasm Specialist",
    location:        "Buenos Aires, AR",
    trust_score:     72,
    identity_tier:   1,
    match_score:     0.78,
    skills_score:    82,
    past_work_score: 74,
    behavior_score:  78,
    skill_tags:      ["wasm", "k8s", "rust"],
    rate_cents:      9500,
    availability:    "limited",
    deployments:     9,
  },
  {
    id:              "tal-004",
    name:            "Aisha M.",
    title:           "Backend + Kafka Engineer",
    location:        "Lagos, NG",
    trust_score:     65,
    identity_tier:   1,
    match_score:     0.71,
    skills_score:    75,
    past_work_score: 68,
    behavior_score:  72,
    skill_tags:      ["kafka", "postgres", "python"],
    rate_cents:      7800,
    availability:    "available",
    deployments:     5,
  },
  {
    id:              "tal-005",
    name:            "Chen W.",
    title:           "Distributed Systems Engineer",
    location:        "Singapore, SG",
    trust_score:     58,
    identity_tier:   1,
    match_score:     0.63,
    skills_score:    66,
    past_work_score: 61,
    behavior_score:  62,
    skill_tags:      ["kafka", "rust"],
    rate_cents:      12000,
    availability:    "limited",
    deployments:     3,
  },
  {
    id:              "tal-006",
    name:            "Yuki S.",
    title:           "Rust Generalist",
    location:        "Tokyo, JP",
    trust_score:     42,
    identity_tier:   0,
    match_score:     0.51,
    skills_score:    54,
    past_work_score: 48,
    behavior_score:  53,
    skill_tags:      ["rust"],
    rate_cents:      10000,
    availability:    "available",
    deployments:     1,
  },
];

const SKILL_ICONS: Record<string, React.ElementType> = {
  rust:     Code2,
  wasm:     Cpu,
  kafka:    Database,
  postgres: Database,
  mlops:    Brain,
  k8s:      Globe,
  python:   Code2,
};

const AVAIL_META = {
  available:   { label: "Available",   color: "text-green-400 border-green-800" },
  limited:     { label: "Limited",     color: "text-amber-400 border-amber-800" },
  unavailable: { label: "Unavailable", color: "text-zinc-500  border-zinc-700"  },
};

// ── Sidebar nav ────────────────────────────────────────────────────────────────

const SIDEBAR_NAV = [
  { label: "Dashboard",    href: "/dashboard"    },
  { label: "Marketplace",  href: "/marketplace"  },
  { label: "Leaderboard",  href: "/leaderboard"  },
  { label: "Matching",     href: "/matching", active: true },
  { label: "Profile",      href: "/profile"      },
];

const AI_TOOLS_NAV = [
  { label: "Scoping",      href: "/scoping"      },
  { label: "Outcomes",     href: "/outcomes"     },
  { label: "Proposals",    href: "/proposals"    },
  { label: "Pricing Tool", href: "/pricing-tool" },
  { label: "Hybrid Match", href: "/hybrid-match" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtRate(cents: number) {
  return `$${(cents / 100).toFixed(0)}/hr`;
}

function overallColor(score: number) {
  if (score >= 0.8) return "text-green-400";
  if (score >= 0.6) return "text-amber-400";
  return "text-zinc-500";
}

function subColor(score: number): "green" | "amber" | "red" {
  if (score >= 75) return "green";
  if (score >= 50) return "amber";
  return "red";
}

// ── CandidateRow ──────────────────────────────────────────────────────────────

function CandidateRow({ candidate, rank }: { candidate: MatchCandidate; rank: number }) {
  const [open, setOpen] = useState(false);
  const avail = AVAIL_META[candidate.availability];

  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900/50 overflow-hidden">
      {/* Main row */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-900 transition-colors"
      >
        {/* Rank */}
        <span className="font-mono text-xs text-zinc-600 w-5 flex-shrink-0">{rank}</span>

        {/* Name + title */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-xs font-medium text-zinc-100 truncate">{candidate.name}</p>
            <VettingBadge tier={candidate.identity_tier} compact />
          </div>
          <p className="font-mono text-[10px] text-zinc-500 truncate mt-0.5">{candidate.title}</p>
        </div>

        {/* Skill tags */}
        <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
          {candidate.skill_tags.slice(0, 3).map((tag) => {
            const Icon = SKILL_ICONS[tag] ?? Code2;
            return (
              <span key={tag} className="font-mono text-[9px] border border-zinc-800 text-zinc-500 px-1 py-0.5 rounded-sm flex items-center gap-0.5">
                <Icon className="w-2.5 h-2.5" />{tag}
              </span>
            );
          })}
        </div>

        {/* Availability */}
        <span className={`font-mono text-[9px] border px-1.5 py-0.5 rounded-sm flex-shrink-0 ${avail.color}`}>
          {avail.label}
        </span>

        {/* Rate */}
        <span className="font-mono text-xs text-zinc-400 tabular-nums flex-shrink-0 w-16 text-right">
          {fmtRate(candidate.rate_cents)}
        </span>

        {/* Overall score */}
        <span className={`font-mono text-sm font-medium tabular-nums flex-shrink-0 w-10 text-right ${overallColor(candidate.match_score)}`}>
          {(candidate.match_score * 100).toFixed(0)}%
        </span>

        {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />}
      </button>

      {/* Expanded breakdown */}
      {open && (
        <div className="border-t border-zinc-800 px-4 py-3 bg-zinc-950/50 space-y-4">
          {/* Sub-scores */}
          <div className="space-y-2">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Score Breakdown</p>
            <SubScoreBar label="Skills Assessment"    score={candidate.skills_score}    color={subColor(candidate.skills_score)} />
            <SubScoreBar label="Past Work Analysis"   score={candidate.past_work_score} color={subColor(candidate.past_work_score)} />
            <SubScoreBar label="Client Behavior Fit"  score={candidate.behavior_score}  color={subColor(candidate.behavior_score)} />
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Trust",       value: `${candidate.trust_score}/100` },
              { label: "Deployments", value: candidate.deployments.toString() },
              { label: "Location",    value: candidate.location },
            ].map(({ label, value }) => (
              <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-sm p-2">
                <p className="font-mono text-[10px] text-zinc-600 uppercase">{label}</p>
                <p className="font-mono text-xs text-zinc-300 mt-0.5 truncate">{value}</p>
              </div>
            ))}
          </div>

          {/* SOW auto-proposal indicator */}
          {candidate.match_score >= 0.85 && (
            <div className="flex items-center gap-2 px-2 py-1.5 border border-amber-900 bg-amber-950/30 rounded-sm">
              <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
              <p className="font-mono text-[10px] text-amber-400">
                Bot Orchestrator will auto-propose SOW for this candidate (match ≥ 85%)
              </p>
            </div>
          )}

          {/* CTA */}
          <div className="flex gap-2">
            <button className="flex-1 h-9 rounded-sm border border-amber-900 bg-amber-950 text-amber-400
                               font-mono text-xs uppercase tracking-widest hover:border-amber-700 transition-colors">
              Invite to Project
            </button>
            <Link
              href="/hybrid-match"
              className="h-9 px-3 rounded-sm border border-zinc-700 text-zinc-400 font-mono text-xs
                         flex items-center gap-1 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Hybrid Match
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function MatchingPage() {
  const [minScore, setMinScore] = useState(0);
  const [tierFilter, setTierFilter] = useState<"all" | "0" | "1" | "2">("all");

  const filtered = DEMO_CANDIDATES
    .filter((c) => c.match_score >= minScore / 100)
    .filter((c) => tierFilter === "all" || c.identity_tier === Number(tierFilter))
    .sort((a, b) => b.match_score - a.match_score);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      {/* Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-56 border-r border-zinc-800 bg-zinc-950 p-4 gap-6">
        <span className="font-mono text-xs text-zinc-500 uppercase tracking-widest">AiStaffApp</span>
        <nav className="flex flex-col gap-1">
          {SIDEBAR_NAV.map(({ label, href, active }) => (
            <Link key={label} href={href}
              className={`px-3 py-2 rounded-sm font-mono text-xs transition-colors ${
                active ? "text-zinc-100 bg-zinc-800" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
              }`}
            >{label}</Link>
          ))}
        </nav>
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-700 uppercase tracking-widest px-3">AI Tools</p>
          {AI_TOOLS_NAV.map(({ label, href }) => (
            <Link key={label} href={href}
              className="block px-3 py-1.5 rounded-sm font-mono text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
            >{label}</Link>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-4 pb-20 lg:pb-4 max-w-3xl mx-auto w-full space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
              AI Matching Engine
            </h1>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">
              Skills · Past Work · Client Behavior — {filtered.length} candidates
            </p>
          </div>
          <Brain className="w-5 h-5 text-amber-500" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 p-3 border border-zinc-800 rounded-sm bg-zinc-900/50">
          <div className="flex items-center gap-2 flex-1 min-w-[160px]">
            <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest whitespace-nowrap">
              Min Score
            </label>
            <input
              type="range" min={0} max={90} step={5} value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="flex-1 accent-amber-500"
            />
            <span className="font-mono text-xs text-amber-400 tabular-nums w-8">{minScore}%</span>
          </div>
          <div className="flex items-center gap-1">
            {(["all", "0", "1", "2"] as const).map((t) => (
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
        </div>

        {/* Score legend */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Skills Assessment",   desc: "Required skill match",       color: "text-zinc-400" },
            { label: "Past Work Analysis",  desc: "Similar project history",    color: "text-zinc-400" },
            { label: "Client Behavior Fit", desc: "Communication + delivery",   color: "text-zinc-400" },
          ].map(({ label, desc, color }) => (
            <div key={label} className="border border-zinc-800 rounded-sm p-2 bg-zinc-900/30">
              <p className={`font-mono text-[10px] font-medium ${color}`}>{label}</p>
              <p className="font-mono text-[9px] text-zinc-600 mt-0.5">{desc}</p>
            </div>
          ))}
        </div>

        {/* Candidate list */}
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="border border-zinc-800 rounded-sm p-8 text-center">
              <AlertCircle className="w-5 h-5 text-zinc-700 mx-auto mb-2" />
              <p className="font-mono text-xs text-zinc-600">No candidates match the current filters</p>
            </div>
          ) : (
            filtered.map((c, i) => (
              <CandidateRow key={c.id} candidate={c} rank={i + 1} />
            ))
          )}
        </div>

        {/* AI Tools links */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-zinc-800">
          {[
            { label: "Outcome Matching", href: "/outcomes",     desc: "ROI-based results" },
            { label: "Proposal Scoring", href: "/proposals",    desc: "Filter AI spam"     },
            { label: "Hybrid Match",     href: "/hybrid-match", desc: "Human recruiter"   },
            { label: "Scoping Tool",     href: "/scoping",      desc: "Brief → SOW"       },
            { label: "Market Pricing",   href: "/pricing-tool", desc: "Rate suggestions"  },
          ].map(({ label, href, desc }) => (
            <Link key={label} href={href}
              className="border border-zinc-800 rounded-sm p-2.5 hover:border-zinc-600 hover:bg-zinc-900 transition-colors group"
            >
              <p className="font-mono text-xs text-zinc-300 group-hover:text-zinc-100">{label}</p>
              <p className="font-mono text-[10px] text-zinc-600 mt-0.5">{desc}</p>
            </Link>
          ))}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-16 flex items-center border-t border-zinc-800 bg-zinc-950">
        {[
          { label: "Dash",     href: "/dashboard"  },
          { label: "Market",   href: "/marketplace"},
          { label: "Matching", href: "/matching", active: true },
          { label: "Profile",  href: "/profile"    },
        ].map(({ label, href, active }) => (
          <Link key={label} href={href} className={`nav-tab ${active ? "active" : ""}`}>
            <span className="text-[10px]">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
