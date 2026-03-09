"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Shield, Info, ChevronRight, AlertTriangle, CheckCircle,
  Clock, User, Cpu, BookOpen, Save, Filter,
} from "lucide-react";

/* ─── Demo data ─────────────────────────────────────── */
const POH_SCORE = 88;
const DEPLOYMENT_ID = "dep-7f3a91";
const MILESTONE = "API Integration — Sprint 4";

type BadgeKind = "expert" | "pure" | "ai";
function scoreBadge(s: number): BadgeKind {
  if (s >= 90) return "pure";
  if (s >= 70) return "expert";
  return "ai";
}
const BADGE_META: Record<BadgeKind, { label: string; cls: string }> = {
  expert: { label: "Expert Orchestrated",  cls: "border-violet-700 bg-violet-950/30 text-violet-400" },
  pure:   { label: "Pure Human Craft",     cls: "border-green-700  bg-green-950/30  text-green-400"  },
  ai:     { label: "AI-Assisted",          cls: "border-amber-800  bg-amber-950/30  text-amber-400"  },
};

/* ─── Activity-heatmap data ─────────────────────────── */
type CellKind = "none" | "low" | "med" | "high" | "ai" | "deep";
interface HeatCell { kind: CellKind; date: string; duration: string }

function buildHeatmap(): HeatCell[][] {
  const weeks: HeatCell[][] = [];
  const base = new Date(2026, 0, 5); // Mon 5 Jan 2026
  const kindSeq: CellKind[] = [
    "none","low","high","deep","ai","med","none",
    "high","ai","low","deep","med","none","high",
    "med","none","ai","deep","high","low","med",
    "high","deep","ai","none","med","low","high",
    "deep","high","ai","med","none","low","deep",
    "med","high","none","ai","deep","low","med",
    "high","ai","med","deep","none","high","low",
    "med","none","deep","ai","high","low","med",
    "high","deep","none","ai","med","low","high",
    "low","med","high","deep","none","ai","low",
    "high","none","med","ai","deep","low","high",
    "none","low","med","high","ai","deep","none",
  ];
  const sessions = ["custom auth logic","boilerplate CRUD","UI refinement","docs pass","peer review","edge-case debug","meeting notes","QA sign-off"];
  const durations = ["42 min","60 min","45 min","30 min","55 min","62 min","28 min","35 min"];
  let idx = 0;
  for (let w = 0; w < 12; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(base);
      dt.setDate(base.getDate() + w * 7 + d);
      col.push({
        kind: kindSeq[idx % kindSeq.length],
        date: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        duration: durations[idx % durations.length],
      });
      idx++;
    }
    weeks.push(col);
  }
  return weeks;
}
const HEATMAP = buildHeatmap();

const CELL_CLS: Record<CellKind, string> = {
  none:  "bg-zinc-800",
  low:   "bg-amber-950",
  med:   "bg-amber-800",
  high:  "bg-amber-500",
  ai:    "bg-amber-950",
  deep:  "bg-blue-950/60 border border-blue-800",
};

/* ─── Work anatomy ───────────────────────────────────── */
const ANATOMY = [
  { task: "Architecture & Logic", human: 95, ai: 5,  icon: BookOpen },
  { task: "Initial Drafting",     human: 20, ai: 80, icon: Cpu      },
  { task: "Review & Polishing",   human: 100,ai: 0,  icon: CheckCircle },
  { task: "Edge-Case Testing",    human: 70, ai: 30, icon: Shield   },
  { task: "Documentation",        human: 10, ai: 90, icon: BookOpen },
  { task: "Client Communication", human: 100,ai: 0,  icon: User     },
];
const TOTAL_HUMAN = Math.round(ANATOMY.reduce((s,r)=>s+r.human,0)/ANATOMY.length);
const TOTAL_AI    = 100 - TOTAL_HUMAN;

/* ─── Audit trail ────────────────────────────────────── */
type AuditKind = "human" | "ai" | "deep";
interface AuditEntry { time: string; desc: string; kind: AuditKind }
const AUDIT: AuditEntry[] = [
  { time:"09:12 AM", desc:"Custom auth logic in auth.py",                        kind:"human" },
  { time:"09:45 AM", desc:"AI-generated boilerplate for CRUD endpoints",         kind:"ai"    },
  { time:"10:30 AM", desc:"45 min manual UI refinement (no tab switching)",      kind:"deep"  },
  { time:"11:15 AM", desc:"AI-generated docs from JSDoc comments",               kind:"ai"    },
  { time:"12:00 PM", desc:"Peer review session with client",                     kind:"human" },
  { time:"13:30 PM", desc:"Edge-case debugging (uninterrupted, 62 min)",         kind:"deep"  },
  { time:"14:45 PM", desc:"AI-summarised meeting notes",                         kind:"ai"    },
  { time:"15:30 PM", desc:"Final QA sign-off",                                   kind:"human" },
];
const AUDIT_DOT: Record<AuditKind, string> = {
  human: "bg-amber-400",
  ai:    "bg-zinc-500",
  deep:  "bg-blue-500",
};
const AUDIT_LABEL: Record<AuditKind, string> = {
  human: "Human",
  ai:    "AI",
  deep:  "Deep Work",
};

type AuditFilter = "all" | "human" | "ai" | "deep";

/* ─── Sidebar nav (same pattern as other pages) ──────── */
const MAIN_NAV = [
  { label: "Dashboard",   href: "/dashboard"   },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Leaderboard", href: "/leaderboard" },
];
const TRUST_NAV = [
  { label: "Proof of Human", href: "/proof-of-human" },
];

/* ═══════════════════════════════════════════════════════
   HLI HERO — SVG circular gauge
═══════════════════════════════════════════════════════ */
function HliHero({ score }: { score: number }) {
  const [showTip, setShowTip] = useState(false);
  const badge = scoreBadge(score);
  const meta  = BADGE_META[badge];
  const R = 52;
  const CIRC = 2 * Math.PI * R;
  const filled = (score / 100) * CIRC;
  const gap    = CIRC - filled;

  return (
    <section className="border border-zinc-800 rounded-sm p-4 md:p-6">
      <div className="flex flex-col items-center gap-4">
        {/* gauge */}
        <div className="relative w-36 h-36 flex items-center justify-center">
          <svg viewBox="0 0 120 120" className="absolute inset-0 w-full h-full -rotate-90">
            {/* track */}
            <circle cx="60" cy="60" r={R} fill="none"
              stroke="rgb(39 39 42)"   /* zinc-800 */
              strokeWidth="10" />
            {/* fill */}
            <circle cx="60" cy="60" r={R} fill="none"
              stroke="rgb(251 191 36)" /* amber-400 */
              strokeWidth="10"
              strokeDasharray={`${filled} ${gap}`}
              strokeLinecap="round" />
          </svg>
          <div className="relative text-center">
            <div className="font-mono text-3xl font-bold text-amber-400 leading-none">
              {score}<span className="text-lg">%</span>
            </div>
            <div className="text-[10px] text-zinc-400 tracking-widest mt-0.5">HUMAN-LED</div>
          </div>
        </div>

        {/* badge */}
        <span className={`border px-3 py-1 rounded-sm text-xs font-mono ${meta.cls}`}>
          {meta.label}
        </span>

        {/* deployment info + info icon */}
        <div className="text-center space-y-0.5">
          <p className="text-xs text-zinc-400 font-mono">{DEPLOYMENT_ID}</p>
          <p className="text-xs text-zinc-300">{MILESTONE}</p>
        </div>

        {/* info tooltip */}
        <div className="relative flex items-center gap-1 text-xs text-zinc-500 cursor-default"
          onMouseEnter={() => setShowTip(true)}
          onMouseLeave={() => setShowTip(false)}
        >
          <Info size={12} />
          <span>How is this score calculated?</span>
          {showTip && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-zinc-900 border border-zinc-700
                            text-zinc-300 text-xs rounded-sm p-3 z-10 text-left shadow-xl">
              Manual iteration + complex problem-solving signatures detected.
              Score derived from: keystroke timing patterns · version-control delta depth ·
              tab-switching frequency · session continuity index.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   ACTIVITY HEATMAP
═══════════════════════════════════════════════════════ */
function ActivityHeatmap() {
  const [hovered, setHovered] = useState<HeatCell | null>(null);

  return (
    <section className="border border-zinc-800 rounded-sm p-4">
      <h2 className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-3">
        Activity Heatmap — last 12 weeks
      </h2>

      {/* grid */}
      <div className="overflow-x-auto">
        <div className="flex gap-[3px] min-w-max relative">
          {HEATMAP.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((cell, di) => (
                <div key={di}
                  className={`relative w-3.5 h-3.5 rounded-[2px] flex items-center justify-center
                               cursor-pointer transition-opacity hover:opacity-80
                               ${CELL_CLS[cell.kind]}`}
                  onMouseEnter={() => setHovered(cell)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {cell.kind === "ai" && (
                    <span className="text-amber-300 text-[6px] leading-none select-none">✦</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* hover tooltip */}
      {hovered && (
        <div className="mt-2 text-xs text-zinc-400 font-mono">
          {hovered.date} · {AUDIT_LABEL[hovered.kind === "ai" ? "ai" : hovered.kind === "deep" ? "deep" : "human"]} · {hovered.duration}
        </div>
      )}

      {/* legend */}
      <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] text-zinc-500">
        {[
          { cls:"bg-zinc-800",          label:"None"        },
          { cls:"bg-amber-950",         label:"Low"         },
          { cls:"bg-amber-800",         label:"Medium"      },
          { cls:"bg-amber-500",         label:"High"        },
          { cls:"bg-amber-950 relative", label:"AI Assist", sparkle: true },
          { cls:"bg-blue-950/60 border border-blue-800", label:"Deep Work" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded-[2px] ${l.cls} flex items-center justify-center`}>
              {l.sparkle && <span className="text-amber-300 text-[5px]">✦</span>}
            </div>
            <span>{l.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   WORK ANATOMY TABLE
═══════════════════════════════════════════════════════ */
function WorkAnatomy() {
  return (
    <section className="border border-zinc-800 rounded-sm p-4">
      <h2 className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-3">
        Work Anatomy Breakdown
      </h2>
      <div className="space-y-3">
        {ANATOMY.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.task} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
              {/* task + bars */}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={11} className="text-zinc-500 shrink-0" />
                  <span className="text-xs text-zinc-300 truncate">{row.task}</span>
                </div>
                <div className="flex gap-0.5 h-2">
                  <div className="bg-amber-500 rounded-[1px] transition-all"
                    style={{ width: `${row.human}%` }} />
                  <div className="bg-zinc-700 rounded-[1px] transition-all"
                    style={{ width: `${row.ai}%` }} />
                </div>
              </div>
              {/* human % */}
              <div className="text-right">
                <div className="text-[10px] text-zinc-500">Human</div>
                <div className="text-xs font-mono text-amber-400">{row.human}%</div>
              </div>
              {/* ai % */}
              <div className="text-right">
                <div className="text-[10px] text-zinc-500">AI</div>
                <div className="text-xs font-mono text-zinc-400">{row.ai}%</div>
              </div>
            </div>
          );
        })}
        {/* totals */}
        <div className="border-t border-zinc-800 pt-2 grid grid-cols-[1fr_auto_auto] gap-2 items-center">
          <div className="text-xs text-zinc-400 font-mono">Weighted total</div>
          <div className="text-right">
            <div className="text-xs font-mono text-amber-400 font-bold">{TOTAL_HUMAN}%</div>
          </div>
          <div className="text-right">
            <div className="text-xs font-mono text-zinc-400 font-bold">{TOTAL_AI}%</div>
          </div>
        </div>
        {/* bar legend */}
        <div className="flex gap-4 text-[10px] text-zinc-500">
          <div className="flex items-center gap-1"><div className="w-3 h-2 bg-amber-500 rounded-[1px]" /><span>Human</span></div>
          <div className="flex items-center gap-1"><div className="w-3 h-2 bg-zinc-700 rounded-[1px]" /><span>AI</span></div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   AUDIT TRAIL
═══════════════════════════════════════════════════════ */
function AuditTrail() {
  const [filter, setFilter] = useState<AuditFilter>("all");
  const visible = filter === "all" ? AUDIT : AUDIT.filter(e => e.kind === filter);

  const filters: { id: AuditFilter; label: string }[] = [
    { id: "all",   label: "All"        },
    { id: "human", label: "Human Only" },
    { id: "ai",    label: "AI Only"    },
    { id: "deep",  label: "Deep Work"  },
  ];

  return (
    <section className="border border-zinc-800 rounded-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Audit Trail</h2>
        <div className="flex gap-1">
          {filters.map(f => (
            <button key={f.id}
              className={`px-2 py-0.5 text-[10px] rounded-sm border transition-colors ${
                filter === f.id
                  ? "border-amber-700 bg-amber-950/30 text-amber-400"
                  : "border-zinc-700 text-zinc-500 hover:border-zinc-600"
              }`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {visible.map((e, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${
              e.kind === "ai" ? "" : AUDIT_DOT[e.kind]
            } ${e.kind === "ai" ? "border border-zinc-500" : ""}`}
              style={e.kind === "ai" ? { background: "none" } : undefined}
            >
              {e.kind === "ai" && (
                <span className="text-zinc-400 text-[8px] leading-none flex items-center justify-center w-full h-full">✦</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono text-zinc-500">{e.time}</span>
                <span className={`text-[10px] px-1.5 rounded-sm border ${
                  e.kind === "human" ? "border-amber-900 text-amber-500" :
                  e.kind === "deep"  ? "border-blue-900 text-blue-400"   :
                                       "border-zinc-700 text-zinc-500"
                }`}>
                  {AUDIT_LABEL[e.kind]}
                </span>
              </div>
              <p className="text-xs text-zinc-300 mt-0.5">{e.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* verified output badge */}
      <div className="mt-4 flex items-center gap-2 border-t border-zinc-800 pt-3">
        <CheckCircle size={12} className="text-violet-400 shrink-0" />
        <span className="text-xs text-zinc-400">Verified output classification:</span>
        <span className="border border-violet-700 bg-violet-950/30 text-violet-400 text-[10px] px-2 py-0.5 rounded-sm font-mono">
          Expert Orchestrated
        </span>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   NO-SCREEN PRIVACY GUARANTEE
═══════════════════════════════════════════════════════ */
function PrivacyGuarantee() {
  return (
    <section className="border border-amber-800 bg-amber-950/20 rounded-sm p-4">
      <div className="flex items-start gap-3">
        <Shield size={16} className="text-amber-400 mt-0.5 shrink-0" />
        <div className="space-y-2">
          <p className="text-sm font-semibold text-amber-300">No-Screen Privacy Guarantee</p>
          <p className="text-xs text-amber-200/70">
            No private data or screen images were captured during this work session.
          </p>
          <div className="space-y-1 text-[11px] text-zinc-400">
            <p>Derived from: behavioral metadata · version control history · keystroke timing patterns</p>
            <p>This report is reproducible and verifiable.</p>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[10px] text-zinc-500 font-mono">SHA-256 report hash:</span>
            <code className="text-[10px] text-amber-400 font-mono bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-sm">
              0xf3a1…d8b2
            </code>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   RED FLAG & REVIEW SYSTEM
═══════════════════════════════════════════════════════ */
function RedFlagSection({ score }: { score: number }) {
  const [threshold, setThreshold] = useState(40);
  const [editThreshold, setEditThreshold] = useState(false);
  const [requested, setRequested] = useState(false);

  const isLow = score < threshold;
  if (!isLow) return null;

  return (
    <section className="border border-red-900 bg-red-950/30 rounded-sm p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-sm font-semibold text-red-300">PoH Score Below Threshold</p>
            <p className="text-xs text-red-400/70 mt-0.5">
              Score {score}% is below the configured threshold of {threshold}%.
            </p>
          </div>

          {/* threshold editor */}
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>Threshold:</span>
            {editThreshold ? (
              <div className="flex items-center gap-1">
                <input type="number" min={10} max={90}
                  className="w-14 bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-mono px-1.5 py-0.5 rounded-sm"
                  value={threshold}
                  onChange={e => setThreshold(Number(e.target.value))}
                />
                <button className="text-amber-400 hover:text-amber-300 text-[10px]"
                  onClick={() => setEditThreshold(false)}>Save</button>
              </div>
            ) : (
              <button className="text-amber-400 hover:text-amber-300 underline decoration-dashed underline-offset-2"
                onClick={() => setEditThreshold(true)}>{threshold}%</button>
            )}
            <span className="text-zinc-600">(Project Tier: Standard)</span>
          </div>

          {/* request review */}
          {!requested ? (
            <button
              className="px-3 py-1.5 bg-red-900/40 border border-red-800 text-red-300 text-xs rounded-sm
                         hover:bg-red-900/60 transition-colors"
              onClick={() => setRequested(true)}
            >
              Request a Review
            </button>
          ) : (
            <div className="flex items-center gap-2 text-xs text-green-400">
              <CheckCircle size={12} />
              Review request submitted — client notified.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   FREELANCER DEFENSE BOX
═══════════════════════════════════════════════════════ */
const DEFENSE_DEFAULT =
  "Used AI for initial data cleaning to save 3 hrs of billing; manually verified every 1,847 rows against source schema.";

function DefenseBox() {
  const [text, setText] = useState(DEFENSE_DEFAULT);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <section className="border border-zinc-800 rounded-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Freelancer Context</h2>
        <span className="text-[10px] text-zinc-600">Visible to client on this PoH report</span>
      </div>
      <textarea
        className="w-full bg-zinc-900 border border-zinc-800 rounded-sm text-xs text-zinc-300 p-3
                   font-mono resize-none focus:outline-none focus:border-zinc-600 transition-colors"
        rows={3}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Add context for your client..."
      />
      <div className="flex items-center justify-between mt-2">
        <div className={`flex items-center gap-1.5 text-xs transition-opacity duration-300 ${saved ? "opacity-100 text-green-400" : "opacity-0"}`}>
          <CheckCircle size={11} />
          Saved &amp; visible to client
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700
                     border border-zinc-700 text-zinc-300 text-xs rounded-sm transition-colors"
          onClick={handleSave}
        >
          <Save size={11} />
          Save
        </button>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════ */
export default function ProofOfHumanPage() {
  const [simLow, setSimLow] = useState(false);
  const displayScore = simLow ? 25 : POH_SCORE;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">

      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-52 shrink-0 border-r border-zinc-800 p-3 gap-6">
        <div className="flex items-center gap-2 py-2">
          <span className="font-mono text-sm font-bold text-amber-400">AiStaff</span>
          <span className="text-[10px] text-zinc-600 border border-zinc-800 px-1 rounded-sm">POH</span>
        </div>

        {/* main nav */}
        <nav className="flex flex-col gap-1">
          {MAIN_NAV.map(n => (
            <Link key={n.href} href={n.href}
              className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-400 rounded-sm
                         hover:bg-zinc-800 hover:text-zinc-100 transition-colors">
              {n.label}
            </Link>
          ))}
        </nav>

        {/* trust nav */}
        <div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider px-2 mb-1">Trust</p>
          {TRUST_NAV.map(n => (
            <Link key={n.href} href={n.href}
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm
                         bg-zinc-800 text-amber-400 font-medium">
              <Shield size={11} />
              {n.label}
            </Link>
          ))}
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 p-4 md:p-6 space-y-4">

        {/* page header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <h1 className="text-base font-semibold text-zinc-100 font-mono">Proof of Human</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Transparency report for {DEPLOYMENT_ID} · {MILESTONE}
            </p>
          </div>

          {/* demo toggle */}
          <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer select-none self-start sm:self-auto">
            <div className={`relative w-8 h-4 rounded-full border transition-colors ${
              simLow ? "border-red-800 bg-red-950/40" : "border-zinc-700 bg-zinc-800"
            }`}
              onClick={() => setSimLow(v => !v)}
              role="button" tabIndex={0}
              onKeyDown={e => e.key === "Enter" && setSimLow(v => !v)}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${
                simLow ? "left-4 bg-red-400" : "left-0.5 bg-zinc-500"
              }`} />
            </div>
            Simulate low score
          </label>
        </div>

        {/* breadcrumb */}
        <div className="flex items-center gap-1 text-[10px] text-zinc-600">
          <Link href="/dashboard" className="hover:text-zinc-400">Dashboard</Link>
          <ChevronRight size={10} />
          <span className="text-zinc-400">Proof of Human</span>
        </div>

        {/* section 1 — HLI hero */}
        <HliHero score={displayScore} />

        {/* section 2 — heatmap */}
        <ActivityHeatmap />

        {/* section 3 — work anatomy */}
        <WorkAnatomy />

        {/* section 4 — audit trail */}
        <AuditTrail />

        {/* section 5 — privacy */}
        <PrivacyGuarantee />

        {/* section 6 — red flag (conditional) */}
        <RedFlagSection score={displayScore} />

        {/* section 7 — defense box */}
        <DefenseBox />

        {/* mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-zinc-950 border-t border-zinc-800
                        flex items-center justify-around px-4 z-50">
          {MAIN_NAV.map(n => (
            <Link key={n.href} href={n.href}
              className="text-[10px] text-zinc-500 flex flex-col items-center gap-0.5 hover:text-zinc-100">
              <ChevronRight size={14} />
              {n.label}
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
