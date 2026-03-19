"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Brain, ChevronDown, ChevronUp, Zap,
  Code2, Database, Cpu, Globe,
  Bot, Users, User, Clock, ShieldCheck,
  CheckCircle2, AlertCircle, ArrowRight, Star,
  Search, SlidersHorizontal, Loader2,
} from "lucide-react";
import { SubScoreBar } from "@/components/SubScoreBar";
import { VettingBadge } from "@/components/VettingBadge";
import {
  fetchMatches, fetchPublicProfile, fetchSkillTags,
  inviteToProject, startTrial, updateTrial,
  type SkillTag, type TrialResponse,
} from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface MatchCandidate {
  id:               string;
  name:             string;
  title:            string;
  location:         string;
  trust_score:      number;
  identity_tier:    0 | 1 | 2;
  match_score:      number;   // 0–1
  skills_score:     number;   // 0–100
  past_work_score:  number;   // 0–100
  behavior_score:   number;   // 0–100
  skill_tags:       string[];
  rate_cents:       number;
  trial_rate_cents: number;
  availability:     "available" | "limited" | "unavailable";
  deployments:      number;
}

interface HumanRecruiter {
  id:         string;
  name:       string;
  speciality: string;
  placements: number;
  avg_days:   number;
  fee_pct:    number;
  available:  boolean;
}

// ── Demo data (fallback while no live search has been run) ─────────────────────

const CANDIDATES: MatchCandidate[] = [
  {
    id:               "tal-001",
    name:             "Marcus T.",
    title:            "Senior Rust / Wasm Engineer",
    location:         "Berlin, DE",
    trust_score:      94,
    identity_tier:    2,
    match_score:      0.94,
    skills_score:     97,
    past_work_score:  91,
    behavior_score:   93,
    skill_tags:       ["rust", "wasm", "kafka", "postgres"],
    rate_cents:       18500,
    trial_rate_cents: 14000,
    availability:     "available",
    deployments:      24,
  },
  {
    id:               "tal-002",
    name:             "Lena K.",
    title:            "ML Systems Architect",
    location:         "Amsterdam, NL",
    trust_score:      88,
    identity_tier:    2,
    match_score:      0.87,
    skills_score:     89,
    past_work_score:  86,
    behavior_score:   85,
    skill_tags:       ["rust", "mlops", "kafka"],
    rate_cents:       21000,
    trial_rate_cents: 16000,
    availability:     "available",
    deployments:      17,
  },
  {
    id:               "tal-003",
    name:             "Diego R.",
    title:            "DevOps + Wasm Specialist",
    location:         "Buenos Aires, AR",
    trust_score:      72,
    identity_tier:    1,
    match_score:      0.78,
    skills_score:     82,
    past_work_score:  74,
    behavior_score:   78,
    skill_tags:       ["wasm", "k8s", "rust"],
    rate_cents:       9500,
    trial_rate_cents: 7500,
    availability:     "limited",
    deployments:      9,
  },
  {
    id:               "tal-004",
    name:             "Aisha M.",
    title:            "Backend + Kafka Engineer",
    location:         "Lagos, NG",
    trust_score:      65,
    identity_tier:    1,
    match_score:      0.71,
    skills_score:     75,
    past_work_score:  68,
    behavior_score:   72,
    skill_tags:       ["kafka", "postgres", "python"],
    rate_cents:       7800,
    trial_rate_cents: 6200,
    availability:     "available",
    deployments:      5,
  },
  {
    id:               "tal-005",
    name:             "Chen W.",
    title:            "Distributed Systems Engineer",
    location:         "Singapore, SG",
    trust_score:      58,
    identity_tier:    1,
    match_score:      0.63,
    skills_score:     66,
    past_work_score:  61,
    behavior_score:   62,
    skill_tags:       ["kafka", "rust"],
    rate_cents:       12000,
    trial_rate_cents: 9500,
    availability:     "limited",
    deployments:      3,
  },
  {
    id:               "tal-006",
    name:             "Yuki S.",
    title:            "Rust Generalist",
    location:         "Tokyo, JP",
    trust_score:      42,
    identity_tier:    0,
    match_score:      0.51,
    skills_score:     54,
    past_work_score:  48,
    behavior_score:   53,
    skill_tags:       ["rust"],
    rate_cents:       10000,
    trial_rate_cents: 8000,
    availability:     "available",
    deployments:      1,
  },
];

const RECRUITERS: HumanRecruiter[] = [
  { id: "rec-001", name: "Priya S.",  speciality: "AI/ML · Rust · Systems",      placements: 148, avg_days: 9,  fee_pct: 8, available: true  },
  { id: "rec-002", name: "James W.",  speciality: "DevOps · Cloud · Kubernetes",  placements: 93,  avg_days: 12, fee_pct: 7, available: true  },
  { id: "rec-003", name: "Amara O.",  speciality: "Robotics · Embedded · ROS2",   placements: 61,  avg_days: 11, fee_pct: 9, available: false },
];

// ── Sidebar nav ────────────────────────────────────────────────────────────────

const SIDEBAR_NAV = [
  { label: "Dashboard",   href: "/dashboard"   },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Matching",    href: "/matching", active: true },
  { label: "Profile",     href: "/profile"     },
];

const AI_TOOLS_NAV = [
  { label: "Scoping",      href: "/scoping"      },
  { label: "Outcomes",     href: "/outcomes"     },
  { label: "Proposals",    href: "/proposals"    },
  { label: "Pricing Tool", href: "/pricing-tool" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const SKILL_ICONS: Record<string, React.ElementType> = {
  rust: Code2, wasm: Cpu, kafka: Database, postgres: Database,
  mlops: Brain, k8s: Globe, python: Code2,
};

const AVAIL_META = {
  available:   { label: "Available",   color: "text-green-400 border-green-800" },
  limited:     { label: "Limited",     color: "text-amber-400 border-amber-800" },
  unavailable: { label: "Unavailable", color: "text-zinc-500  border-zinc-700"  },
};

function fmtRate(c: number) { return `$${(c / 100).toFixed(0)}/hr`; }

function overallColor(s: number) {
  if (s >= 0.8) return "text-green-400";
  if (s >= 0.6) return "text-amber-400";
  return "text-zinc-500";
}

function subColor(s: number): "green" | "amber" | "red" {
  if (s >= 75) return "green";
  if (s >= 50) return "amber";
  return "red";
}

function tierStringToNum(tier: string): 0 | 1 | 2 {
  if (tier === "BIOMETRIC_VERIFIED") return 2;
  if (tier === "SOCIAL_VERIFIED")    return 1;
  return 0;
}

function availFromString(s: string | null | undefined): "available" | "limited" | "unavailable" {
  if (s === "available")     return "available";
  if (s === "busy")          return "limited";
  if (s === "not-available") return "unavailable";
  return "available";
}

function roleToTitle(role: string | null): string {
  if (role === "talent")      return "Freelancer";
  if (role === "agent-owner") return "Agency Owner";
  if (role === "client")      return "Client";
  return "Freelancer";
}

// ── Mode toggle ────────────────────────────────────────────────────────────────

type PageMode  = "ai" | "hybrid";
type HybridTab = "shortlist" | "human" | "trials";

function ModeToggle({ mode, onChange }: { mode: PageMode; onChange: (m: PageMode) => void }) {
  return (
    <div className="flex items-center gap-1 p-0.5 border border-zinc-800 rounded-sm bg-zinc-900/60 w-fit">
      <button
        onClick={() => onChange("ai")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-xs transition-colors ${
          mode === "ai"
            ? "bg-zinc-800 text-zinc-100"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        <Bot className="w-3.5 h-3.5" />
        AI Match
      </button>
      <button
        onClick={() => onChange("hybrid")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-xs transition-colors ${
          mode === "hybrid"
            ? "bg-zinc-800 text-zinc-100"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        <Users className="w-3.5 h-3.5" />
        Hybrid
        <span className="font-mono text-[9px] px-1 border border-amber-800 text-amber-500 rounded-sm">
          +Recruiter
        </span>
      </button>
    </div>
  );
}

// ── Search form ────────────────────────────────────────────────────────────────

function MatchSearchForm({
  skillTags,
  selectedSkills,
  onToggleSkill,
  minTrust,
  onMinTrustChange,
  searching,
  hasResults,
  error,
  onSearch,
}: {
  skillTags:        SkillTag[];
  selectedSkills:   string[];
  onToggleSkill:    (tag: string) => void;
  minTrust:         number;
  onMinTrustChange: (v: number) => void;
  searching:        boolean;
  hasResults:       boolean;
  error:            string | null;
  onSearch:         () => void;
}) {
  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900/50 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
          Search live talent
        </p>
        {hasResults && (
          <span className="ml-auto font-mono text-[10px] text-amber-500 border border-amber-900 px-1.5 py-0.5 rounded-sm">
            Live results active
          </span>
        )}
      </div>

      {/* Skill tag pills */}
      {skillTags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {skillTags.map(({ tag }) => {
            const active = selectedSkills.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => onToggleSkill(tag)}
                className={`font-mono text-[10px] px-2 py-1 rounded-sm border transition-colors ${
                  active
                    ? "border-amber-700 bg-amber-950/40 text-amber-400"
                    : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex gap-1.5 flex-wrap">
          {["rust", "wasm", "kafka", "postgres", "python", "mlops", "k8s"].map((tag) => {
            const active = selectedSkills.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => onToggleSkill(tag)}
                className={`font-mono text-[10px] px-2 py-1 rounded-sm border transition-colors ${
                  active
                    ? "border-amber-700 bg-amber-950/40 text-amber-400"
                    : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}

      {/* Min trust + search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest whitespace-nowrap">
            Min Trust
          </label>
          <input
            type="range" min={0} max={90} step={5} value={minTrust}
            onChange={(e) => onMinTrustChange(Number(e.target.value))}
            className="flex-1 accent-amber-500"
          />
          <span className="font-mono text-xs text-amber-400 tabular-nums w-7">{minTrust}</span>
        </div>
        <button
          onClick={onSearch}
          disabled={searching || selectedSkills.length === 0}
          className="flex items-center gap-1.5 h-8 px-4 rounded-sm border font-mono text-xs uppercase
                     tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                     border-amber-800 bg-amber-950/30 text-amber-400 hover:border-amber-600"
        >
          {searching
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Search  className="w-3 h-3" />
          }
          {searching ? "Searching…" : "Search Talent"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 font-mono text-[10px]">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI MATCH MODE — full ranked list
// ═══════════════════════════════════════════════════════════════════════════════

function CandidateRow({
  candidate,
  rank,
  onSwitchHybrid,
  onInvite,
}: {
  candidate:      MatchCandidate;
  rank:           number;
  onSwitchHybrid: (id: string) => void;
  onInvite:       (id: string) => void;
}) {
  const [open,     setOpen]     = useState(false);
  const [inviting, setInviting] = useState(false);
  const [invited,  setInvited]  = useState(false);
  const avail = AVAIL_META[candidate.availability];

  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900/50 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-900 transition-colors"
      >
        <span className="font-mono text-xs text-zinc-600 w-5 flex-shrink-0">{rank}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-xs font-medium text-zinc-100 truncate">{candidate.name}</p>
            <VettingBadge tier={candidate.identity_tier} compact />
          </div>
          <p className="font-mono text-[10px] text-zinc-500 truncate mt-0.5">{candidate.title}</p>
        </div>

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

        <span className={`font-mono text-[9px] border px-1.5 py-0.5 rounded-sm flex-shrink-0 ${avail.color}`}>
          {avail.label}
        </span>

        <span className="font-mono text-xs text-zinc-400 tabular-nums flex-shrink-0 w-16 text-right">
          {candidate.rate_cents > 0 ? fmtRate(candidate.rate_cents) : "—"}
        </span>

        <span className={`font-mono text-sm font-medium tabular-nums flex-shrink-0 w-10 text-right ${overallColor(candidate.match_score)}`}>
          {(candidate.match_score * 100).toFixed(0)}%
        </span>

        {open
          ? <ChevronUp   className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
        }
      </button>

      {open && (
        <div className="border-t border-zinc-800 px-4 py-3 bg-zinc-950/50 space-y-4">
          <div className="space-y-2">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Score Breakdown</p>
            <SubScoreBar label="Skills Assessment"   score={candidate.skills_score}    color={subColor(candidate.skills_score)} />
            <SubScoreBar label="Past Work Analysis"  score={candidate.past_work_score} color={subColor(candidate.past_work_score)} />
            <SubScoreBar label="Client Behavior Fit" score={candidate.behavior_score}  color={subColor(candidate.behavior_score)} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Trust",       value: `${candidate.trust_score}/100` },
              { label: "Location",    value: candidate.location },
              { label: "Deployments", value: candidate.deployments > 0 ? candidate.deployments.toString() : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-sm p-2">
                <p className="font-mono text-[10px] text-zinc-600 uppercase">{label}</p>
                <p className="font-mono text-xs text-zinc-300 mt-0.5 truncate">{value}</p>
              </div>
            ))}
          </div>

          {candidate.match_score >= 0.85 && (
            <div className="flex items-center gap-2 px-2 py-1.5 border border-amber-900 bg-amber-950/30 rounded-sm">
              <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
              <p className="font-mono text-[10px] text-amber-400">
                Bot Orchestrator will auto-propose SOW for this candidate (match ≥ 85%)
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              disabled={inviting || invited}
              onClick={async () => {
                setInviting(true);
                try {
                  await onInvite(candidate.id);
                  setInvited(true);
                } finally {
                  setInviting(false);
                }
              }}
              className="flex-1 h-9 rounded-sm border font-mono text-xs uppercase tracking-widest
                         transition-colors flex items-center justify-center gap-1.5
                         disabled:opacity-60 disabled:cursor-not-allowed
                         border-amber-900 bg-amber-950 text-amber-400 hover:border-amber-700"
            >
              {inviting && <Loader2 className="w-3 h-3 animate-spin" />}
              {invited ? "Invited ✓" : "Invite to Project"}
            </button>
            <button
              onClick={() => onSwitchHybrid(candidate.id)}
              className="h-9 px-3 rounded-sm border border-zinc-700 text-zinc-400 font-mono text-xs
                         flex items-center gap-1.5 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              + Recruiter / Trial
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AiMatchMode({
  candidates,
  onSwitchHybrid,
  onInvite,
}: {
  candidates:     MatchCandidate[];
  onSwitchHybrid: (id: string) => void;
  onInvite:       (id: string) => void;
}) {
  const [minScore,   setMinScore]   = useState(0);
  const [tierFilter, setTierFilter] = useState<"all" | "0" | "1" | "2">("all");

  const filtered = candidates
    .filter((c) => c.match_score >= minScore / 100)
    .filter((c) => tierFilter === "all" || c.identity_tier === Number(tierFilter))
    .sort((a, b) => b.match_score - a.match_score);

  return (
    <div className="space-y-4">
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

      {/* Legend */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Skills Assessment",   desc: "Required skill match"     },
          { label: "Past Work Analysis",  desc: "Similar project history"  },
          { label: "Client Behavior Fit", desc: "Communication + delivery" },
        ].map(({ label, desc }) => (
          <div key={label} className="border border-zinc-800 rounded-sm p-2 bg-zinc-900/30">
            <p className="font-mono text-[10px] font-medium text-zinc-400">{label}</p>
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
            <CandidateRow key={c.id} candidate={c} rank={i + 1} onSwitchHybrid={onSwitchHybrid} onInvite={onInvite} />
          ))
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HYBRID MODE — AI Shortlist + Human Recruiter + Active Trials
// ═══════════════════════════════════════════════════════════════════════════════

function TrialCard({
  candidate,
  onStartTrial,
  loading = false,
}: {
  candidate:    MatchCandidate;
  onStartTrial: (id: string) => void;
  loading?:     boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const score = Math.round(candidate.match_score * 100);

  return (
    <div className={`border rounded-sm overflow-hidden transition-colors ${
      score >= 90 ? "border-amber-800/60 bg-amber-950/5" : "border-zinc-800 bg-zinc-900/50"
    }`}>
      <div className="flex items-center gap-3 px-3 py-3">
        <div className={`w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0 border font-mono text-xs font-medium tabular-nums ${
          score >= 90 ? "border-amber-700 bg-amber-950/40 text-amber-400" : "border-zinc-700 bg-zinc-800 text-zinc-400"
        }`}>{score}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-xs font-medium text-zinc-100">{candidate.name}</p>
            <VettingBadge tier={candidate.identity_tier} compact />
            {score >= 90 && (
              <span className="font-mono text-[9px] px-1.5 py-0.5 border border-amber-700 text-amber-400 rounded-sm uppercase tracking-widest">
                AI Pick
              </span>
            )}
          </div>
          <p className="font-mono text-[10px] text-zinc-500 mt-0.5">{candidate.title}</p>
        </div>

        <div className="flex-shrink-0 text-right">
          <p className="font-mono text-[10px] text-zinc-600">Trial</p>
          <p className="font-mono text-xs font-medium text-sky-400 tabular-nums">
            {candidate.trial_rate_cents > 0 ? fmtRate(candidate.trial_rate_cents) : "—"}
          </p>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="font-mono text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors px-1"
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      <div className="flex gap-1.5 px-3 pb-2 flex-wrap">
        {candidate.skill_tags.map((s) => (
          <span key={s} className="font-mono text-[9px] text-zinc-500 border border-zinc-800 px-1.5 py-0.5 rounded-sm">{s}</span>
        ))}
      </div>

      {expanded && (
        <div className="border-t border-zinc-800 bg-zinc-950/50 p-3 space-y-3">
          <div className="space-y-2">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">AI Match Breakdown</p>
            <SubScoreBar label="Skills Alignment" score={candidate.skills_score}    color="amber" />
            <SubScoreBar label="Past Work"         score={candidate.past_work_score} color="green" />
            <SubScoreBar label="Client Behavior"   score={candidate.behavior_score}  color="sky"   />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="border border-zinc-800 rounded-sm p-2">
              <p className="font-mono text-[9px] text-zinc-600 uppercase">Standard Rate</p>
              <p className="font-mono text-sm font-medium text-zinc-400 tabular-nums mt-0.5">
                {candidate.rate_cents > 0 ? fmtRate(candidate.rate_cents) : "—"}
              </p>
            </div>
            <div className="border border-sky-900/50 rounded-sm p-2 bg-sky-950/10">
              <p className="font-mono text-[9px] text-sky-500 uppercase">Trial Rate (7–14d)</p>
              <p className="font-mono text-sm font-medium text-sky-400 tabular-nums mt-0.5">
                {candidate.trial_rate_cents > 0 ? fmtRate(candidate.trial_rate_cents) : "—"}
              </p>
            </div>
          </div>

          <button
            disabled={loading}
            onClick={() => onStartTrial(candidate.id)}
            className="w-full h-9 rounded-sm border border-sky-800 bg-sky-950/30 text-sky-400
                       font-mono text-xs uppercase tracking-widest hover:border-sky-600 transition-colors
                       flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Clock   className="w-3.5 h-3.5" />
            }
            {loading ? "Starting…" : "Start Discounted Trial"}
          </button>
        </div>
      )}
    </div>
  );
}

function RecruiterCard({ recruiter, onEngage }: { recruiter: HumanRecruiter; onEngage: (id: string) => void }) {
  return (
    <div className={`border rounded-sm p-3 transition-colors ${
      recruiter.available ? "border-zinc-700 bg-zinc-900/50" : "border-zinc-800 bg-zinc-900/20 opacity-50"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-sm bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-zinc-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-mono text-xs font-medium text-zinc-100">{recruiter.name}</p>
              {recruiter.available && <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" title="Available" />}
            </div>
            <p className="font-mono text-[10px] text-zinc-500 mt-0.5">{recruiter.speciality}</p>
          </div>
        </div>
        <span className="font-mono text-[9px] text-zinc-600 border border-zinc-800 px-1.5 py-0.5 rounded-sm flex-shrink-0">
          {recruiter.fee_pct}% fee
        </span>
      </div>

      <div className="flex items-center gap-4 mt-2.5">
        <div>
          <p className="font-mono text-[9px] text-zinc-600 uppercase">Placements</p>
          <p className="font-mono text-xs font-medium text-zinc-300 tabular-nums">{recruiter.placements}</p>
        </div>
        <div>
          <p className="font-mono text-[9px] text-zinc-600 uppercase">Avg. Time-to-Fill</p>
          <p className="font-mono text-xs font-medium text-zinc-300 tabular-nums">{recruiter.avg_days} days</p>
        </div>
        <div className="ml-auto">
          {recruiter.available
            ? <button onClick={() => onEngage(recruiter.id)}
                className="h-8 px-3 rounded-sm border border-zinc-700 text-zinc-300 font-mono text-[10px]
                           uppercase tracking-widest hover:border-zinc-500 hover:text-zinc-100 transition-colors">
                Engage
              </button>
            : <span className="font-mono text-[10px] text-zinc-600">Unavailable</span>
          }
        </div>
      </div>
    </div>
  );
}

function HybridMode({
  candidates,
  initialCandidateId,
}: {
  candidates:         MatchCandidate[];
  initialCandidateId?: string;
}) {
  const [tab,          setTab]          = useState<HybridTab>("shortlist");
  const [trialActive,  setTrialActive]  = useState<string | null>(initialCandidateId ?? null);
  const [trialData,    setTrialData]    = useState<TrialResponse | null>(null);
  const [trialLoading, setTrialLoading] = useState(false);
  const [trialError,   setTrialError]   = useState<string | null>(null);
  const [convertDone,  setConvertDone]  = useState(false);
  const [starRating,   setStarRating]   = useState(0);
  const [recruiterMsg, setRecruiterMsg] = useState<string | null>(null);

  async function handleStartTrial(candidateId: string) {
    const c = candidates.find((x) => x.id === candidateId);
    if (!c) return;
    setTrialLoading(true);
    setTrialError(null);
    try {
      const data = await startTrial(candidateId, c.trial_rate_cents);
      setTrialData(data);
      setTrialActive(candidateId);
      setConvertDone(false);
      setStarRating(0);
      setTab("trials");
    } catch (err) {
      setTrialError(err instanceof Error ? err.message : "Failed to start trial");
    } finally {
      setTrialLoading(false);
    }
  }

  const shortlist = candidates.slice(0, 3);

  const TABS: { key: HybridTab; icon: React.ElementType; label: string }[] = [
    { key: "shortlist", icon: Bot,   label: "AI Shortlist"    },
    { key: "human",     icon: Users, label: "Human Recruiter" },
    { key: "trials",    icon: Clock, label: "Active Trials"   },
  ];

  return (
    <div className="space-y-4">
      {/* How it works strip */}
      <div className="border border-zinc-800 rounded-sm p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: Bot,         title: "AI Shortlist",     desc: "Algorithm ranks the top 3 by match score, skills, and past ROI." },
          { icon: Users,       title: "Human Recruiter",  desc: "Add a specialist who vets the shortlist, does live reference checks." },
          { icon: ShieldCheck, title: "7–14d Paid Trial", desc: "Start a discounted paid trial. Money-back guarantee after day 3." },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex gap-2.5">
            <div className="w-6 h-6 rounded-sm border border-zinc-700 bg-zinc-800 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div>
              <p className="font-mono text-xs font-medium text-zinc-200">{title}</p>
              <p className="font-mono text-[10px] text-zinc-500 leading-relaxed mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 font-mono text-xs border-b-2 transition-colors ${
              tab === key
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {key === "trials" && trialActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-0.5" />
            )}
          </button>
        ))}
      </div>

      {/* Shortlist tab */}
      {tab === "shortlist" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">AI-ranked shortlist</p>
            <span className="font-mono text-[10px] text-zinc-600">Top 3 of {candidates.length} candidates</span>
          </div>

          {shortlist.map((c) => (
            <TrialCard
              key={c.id}
              candidate={c}
              onStartTrial={handleStartTrial}
              loading={trialLoading && trialActive === null}
            />
          ))}

          {trialError && (
            <p className="font-mono text-xs text-red-400 px-1">{trialError}</p>
          )}

          <div className="border border-zinc-800 rounded-sm p-3">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Trial Terms</p>
            <ul className="space-y-1.5">
              {[
                "7–14 calendar days at the discounted trial rate shown above",
                "Money-back guarantee if the engagement isn't a fit after day 3",
                "Full escrow protection — funds held until trial milestone agreed",
                "Convert to long-term engagement at any time with zero penalty",
              ].map((t, i) => (
                <li key={i} className="flex items-start gap-2 font-mono text-[10px] text-zinc-400">
                  <CheckCircle2 className="w-3 h-3 text-zinc-600 flex-shrink-0 mt-0.5" />{t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Human Recruiter tab */}
      {tab === "human" && (
        <div className="space-y-3">
          <div className="border border-zinc-800 bg-zinc-900/40 rounded-sm p-3">
            <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-1">Why add a recruiter?</p>
            <p className="font-mono text-xs text-zinc-400 leading-relaxed">
              Human recruiters provide sourcing beyond the platform, conduct live reference checks,
              and negotiate contract terms. Their fee is a one-time % of the first engagement value —
              no ongoing subscription.
            </p>
          </div>

          <div className="space-y-2">
            {RECRUITERS.map((r) => (
              <RecruiterCard key={r.id} recruiter={r} onEngage={(id) => setRecruiterMsg(id)} />
            ))}
          </div>

          {recruiterMsg && (
            <div className="border border-green-900 bg-green-950/10 rounded-sm p-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p className="font-mono text-xs text-green-400">
                Request sent — recruiter will contact you within 4 business hours.
              </p>
            </div>
          )}

          <div className="border border-zinc-800 rounded-sm p-3">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Recruiter SLA</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "First Response",  value: "< 4hrs"  },
                { label: "Shortlist Ready", value: "2 days"  },
                { label: "Avg. Placement",  value: "10 days" },
              ].map(({ label, value }) => (
                <div key={label} className="border border-zinc-800 rounded-sm p-2">
                  <p className="font-mono text-[9px] text-zinc-600 uppercase">{label}</p>
                  <p className="font-mono text-sm font-medium text-zinc-300 mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Active Trials tab */}
      {tab === "trials" && (
        <div className="space-y-3">
          {trialActive ? (() => {
            const c = candidates.find((x) => x.id === trialActive);
            if (!c) return null;
            return (
              <>
                <div className="border border-sky-800/60 rounded-sm bg-sky-950/10 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-sky-800/40">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    <p className="font-mono text-xs font-medium text-sky-300">Trial Active</p>
                    <span className="ml-auto font-mono text-[10px] text-sky-600">7–14 days</span>
                  </div>
                  <div className="p-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <p className="font-mono text-xs font-medium text-zinc-100">{c.name}</p>
                        <p className="font-mono text-[10px] text-zinc-500">{c.title}</p>
                      </div>
                      <VettingBadge tier={c.identity_tier} compact />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="border border-zinc-800 rounded-sm p-2">
                        <p className="font-mono text-[9px] text-zinc-600 uppercase">Trial Rate</p>
                        <p className="font-mono text-sm font-medium text-sky-400">
                          {c.trial_rate_cents > 0 ? fmtRate(c.trial_rate_cents) : "—"}
                        </p>
                      </div>
                      <div className="border border-zinc-800 rounded-sm p-2">
                        <p className="font-mono text-[9px] text-zinc-600 uppercase">Guarantee</p>
                        <p className="font-mono text-sm font-medium text-green-400">Day 3+</p>
                      </div>
                    </div>

                    <div>
                      <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Trial Milestones</p>
                      <div className="space-y-2">
                        {[
                          { day: "Day 1",  label: "Kickoff call + env setup",          done: true  },
                          { day: "Day 3",  label: "Money-back guarantee window closes", done: false },
                          { day: "Day 7",  label: "Mid-trial review checkpoint",        done: false },
                          { day: "Day 14", label: "Trial ends — convert or exit",       done: false },
                        ].map(({ day, label, done }) => (
                          <div key={day} className="flex items-center gap-2.5">
                            <div className={`w-4 h-4 rounded-sm flex items-center justify-center flex-shrink-0 border ${
                              done ? "border-green-700 bg-green-950/40" : "border-zinc-700 bg-zinc-800"
                            }`}>
                              {done && <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />}
                            </div>
                            <span className="font-mono text-[10px] text-zinc-500 w-10 flex-shrink-0">{day}</span>
                            <span className={`font-mono text-[10px] ${done ? "text-zinc-300" : "text-zinc-500"}`}>{label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        disabled={convertDone || !trialData}
                        onClick={async () => {
                          if (!trialData) return;
                          try {
                            await updateTrial(trialData.trial_id, "convert");
                            setConvertDone(true);
                          } catch { /* non-fatal */ }
                        }}
                        className="flex-1 h-9 rounded-sm border font-mono text-[10px] uppercase tracking-widest
                                   transition-colors flex items-center justify-center gap-1.5
                                   disabled:opacity-50 disabled:cursor-not-allowed
                                   border-green-800 bg-green-950/30 text-green-400 hover:border-green-600"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        {convertDone ? "Converted ✓" : "Convert to Engagement"}
                      </button>
                      <button
                        onClick={async () => {
                          if (trialData) {
                            try { await updateTrial(trialData.trial_id, "end"); } catch { /* non-fatal */ }
                          }
                          setTrialActive(null);
                          setTrialData(null);
                          setConvertDone(false);
                          setStarRating(0);
                          setTab("shortlist");
                        }}
                        className="h-9 px-3 rounded-sm border border-zinc-700 text-zinc-500
                                   font-mono text-[10px] uppercase tracking-widest hover:border-zinc-600 transition-colors"
                      >
                        End Trial
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border border-zinc-800 rounded-sm p-3">
                  <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Early Impressions</p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                        onClick={async () => {
                          setStarRating(star);
                          if (trialData) {
                            try { await updateTrial(trialData.trial_id, "rate", { rating: star }); } catch { /* non-fatal */ }
                          }
                        }}
                      >
                        <Star className={`w-5 h-5 transition-colors ${
                          star <= starRating ? "text-amber-500 fill-amber-500" : "text-zinc-700"
                        }`} />
                      </button>
                    ))}
                  </div>
                  {starRating > 0 && (
                    <p className="font-mono text-[10px] text-zinc-600 mt-1">Rating saved — influences leaderboard score</p>
                  )}
                </div>
              </>
            );
          })() : (
            <div className="border border-zinc-800 rounded-sm p-6 text-center">
              <Clock className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
              <p className="font-mono text-xs text-zinc-500">No active trials.</p>
              <p className="font-mono text-[10px] text-zinc-700 mt-1">Start a trial from the AI Shortlist tab.</p>
              <button
                onClick={() => setTab("shortlist")}
                className="mt-4 h-8 px-4 rounded-sm border border-zinc-700 text-zinc-400
                           font-mono text-[10px] uppercase tracking-widest hover:border-zinc-500 transition-colors"
              >
                View Shortlist
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function MatchingPage() {
  const [mode,             setMode]             = useState<PageMode>("ai");
  const [hybridEntryPoint, setHybridEntryPoint] = useState<string | undefined>();

  // ── Search form state ──────────────────────────────────────────────────────
  const [skillTags,      setSkillTags]      = useState<SkillTag[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [minTrust,       setMinTrust]       = useState(0);
  const [searching,      setSearching]      = useState(false);
  const [liveResults,    setLiveResults]    = useState<MatchCandidate[] | null>(null);
  const [searchError,    setSearchError]    = useState<string | null>(null);

  // Load skill tags once on mount
  useEffect(() => {
    fetchSkillTags()
      .then((r) => setSkillTags(r.skill_tags))
      .catch(() => { /* non-fatal — fallback pills will show */ });
  }, []);

  function toggleSkill(tag: string) {
    setSelectedSkills((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function handleSearch() {
    if (selectedSkills.length === 0) return;
    setSearching(true);
    setSearchError(null);
    try {
      const result = await fetchMatches({
        request_id:      crypto.randomUUID(),
        agent_id:        "00000000-0000-0000-0000-000000000000",
        required_skills: selectedSkills,
        min_trust_score: minTrust,
      });

      // Batch-enrich with public profiles (non-fatal per candidate)
      const enriched = await Promise.allSettled(
        result.matches.map((m) => fetchPublicProfile(m.talent_id))
      );

      const candidates: MatchCandidate[] = result.matches.map((m, i) => {
        const profile = enriched[i].status === "fulfilled" ? enriched[i].value : null;
        const rateCents = profile?.hourly_rate_cents ?? 0;
        return {
          id:               m.talent_id,
          name:             profile?.display_name ?? `Talent ${m.talent_id.slice(0, 6)}`,
          title:            roleToTitle(profile?.role ?? null),
          location:         "—",
          trust_score:      m.trust_score,
          identity_tier:    tierStringToNum(profile?.identity_tier ?? "UNVERIFIED"),
          match_score:      m.match_score,
          skills_score:     Math.round(m.match_score * 100),
          past_work_score:  Math.min(100, m.trust_score),
          behavior_score:   Math.round(m.match_score * 90),
          skill_tags:       m.skill_tags,
          rate_cents:       rateCents,
          trial_rate_cents: Math.round(rateCents * 0.75),
          availability:     availFromString(profile?.availability),
          deployments:      0,
        };
      });

      setLiveResults(candidates);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed — is matching_service running?");
    } finally {
      setSearching(false);
    }
  }

  function switchToHybrid(candidateId: string) {
    setHybridEntryPoint(candidateId);
    setMode("hybrid");
  }

  async function handleInvite(candidateId: string) {
    try {
      await inviteToProject(candidateId);
    } catch {
      // non-fatal — button already shows "Invited ✓" optimistically on success
    }
  }

  // Use live results when available, fall back to demo candidates
  const activeCandidates = liveResults ?? CANDIDATES;

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
          <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">AI Tools</p>
          {AI_TOOLS_NAV.map(({ label, href }) => (
            <Link key={label} href={href}
              className="block px-3 py-1.5 rounded-sm font-mono text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
            >{label}</Link>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-4 pb-20 lg:pb-4 max-w-3xl mx-auto w-full space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
              {mode === "ai" ? "AI Matching Engine" : "Hybrid Matching"}
            </h1>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">
              {mode === "ai"
                ? "Skills · Past Work · Client Behavior"
                : "AI shortlist · Human recruiters · Paid trials"
              }
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle mode={mode} onChange={setMode} />
            {mode === "ai" ? <Brain className="w-5 h-5 text-amber-500" /> : <Users className="w-5 h-5 text-amber-500" />}
          </div>
        </div>

        {/* Live search form */}
        <MatchSearchForm
          skillTags={skillTags}
          selectedSkills={selectedSkills}
          onToggleSkill={toggleSkill}
          minTrust={minTrust}
          onMinTrustChange={setMinTrust}
          searching={searching}
          hasResults={liveResults !== null}
          error={searchError}
          onSearch={handleSearch}
        />

        {/* Mode content */}
        {mode === "ai"
          ? <AiMatchMode candidates={activeCandidates} onSwitchHybrid={switchToHybrid} onInvite={handleInvite} />
          : <HybridMode  candidates={activeCandidates} initialCandidateId={hybridEntryPoint} />
        }
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-16 flex items-center border-t border-zinc-800 bg-zinc-950">
        {[
          { label: "Dash",     href: "/dashboard"   },
          { label: "Market",   href: "/marketplace" },
          { label: "Matching", href: "/matching", active: true },
          { label: "Profile",  href: "/profile"     },
        ].map(({ label, href, active }) => (
          <Link key={label} href={href} className={`nav-tab ${active ? "active" : ""}`}>
            <span className="text-[10px]">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
