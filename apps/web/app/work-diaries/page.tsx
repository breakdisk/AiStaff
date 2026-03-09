"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Clock, Code2, FileText, MessageSquare, Coffee, ChevronDown, ChevronUp, Zap } from "lucide-react";

// ── Types & demo data ─────────────────────────────────────────────────────────

type ActivityCategory = "coding" | "testing" | "docs" | "meetings" | "review" | "break";

interface ActivityEntry {
  category: ActivityCategory;
  label:    string;
  hours:    number;
}

interface DiaryEntry {
  date:        string;
  day:         string;
  total_hours: number;
  ai_summary:  string;
  activities:  ActivityEntry[];
  commits:     number;
  files_touched: number;
  mood:        "productive" | "steady" | "blocked";
}

const DEMO_ENTRIES: DiaryEntry[] = [
  {
    date: "2026-03-08", day: "Today",
    total_hours: 7.5, commits: 4, files_touched: 11,
    mood: "productive",
    ai_summary: "Focused session on API authentication layer — implemented JWT refresh token logic and wrote integration tests. Spent final 2hrs updating OpenAPI spec and inline docs.",
    activities: [
      { category: "coding",   label: "JWT refresh token impl",       hours: 3.0 },
      { category: "testing",  label: "Auth integration tests (12)",   hours: 1.5 },
      { category: "coding",   label: "Middleware refactor",           hours: 1.0 },
      { category: "docs",     label: "OpenAPI spec + inline docs",    hours: 2.0 },
    ],
  },
  {
    date: "2026-03-07", day: "Yesterday",
    total_hours: 6.0, commits: 3, files_touched: 8,
    mood: "steady",
    ai_summary: "Kafka consumer setup and event schema alignment with the shared-types crate. Mid-day sync with client to clarify escrow release trigger requirements.",
    activities: [
      { category: "coding",   label: "Kafka consumer + offset mgmt",  hours: 2.5 },
      { category: "coding",   label: "EventEnvelope schema wiring",   hours: 1.5 },
      { category: "meetings", label: "Client sync — escrow triggers",  hours: 0.5 },
      { category: "review",   label: "PR review: deployment-engine",  hours: 1.5 },
    ],
  },
  {
    date: "2026-03-06", day: "Thursday",
    total_hours: 5.5, commits: 2, files_touched: 6,
    mood: "blocked",
    ai_summary: "Wasm sandbox credential injection ran into a wasmtime 30 linker API incompatibility — spent most of the session debugging tuple param signatures. Unblocked by EOD with a working host function wrapper.",
    activities: [
      { category: "coding",   label: "Wasmtime host fn debugging",    hours: 3.0 },
      { category: "docs",     label: "Wasmtime 30 API notes",         hours: 1.0 },
      { category: "coding",   label: "Working host fn impl",          hours: 1.5 },
    ],
  },
  {
    date: "2026-03-05", day: "Wednesday",
    total_hours: 7.0, commits: 5, files_touched: 14,
    mood: "productive",
    ai_summary: "High-output day — shipped the payout service split logic, updated the escrow payout consumer, and added idempotency guard on transaction_id. All tests green.",
    activities: [
      { category: "coding",   label: "split_70_30 payout logic",      hours: 2.0 },
      { category: "testing",  label: "Payout unit tests",             hours: 1.0 },
      { category: "coding",   label: "Kafka escrow consumer update",  hours: 2.0 },
      { category: "coding",   label: "Idempotency guard",             hours: 1.5 },
      { category: "review",   label: "Self-review + squash",          hours: 0.5 },
    ],
  },
  {
    date: "2026-03-04", day: "Tuesday",
    total_hours: 4.0, commits: 1, files_touched: 4,
    mood: "steady",
    ai_summary: "Sprint planning and architecture review for the identity-service ZKP integration. Light coding session setting up the ark-groth16 proof scaffolding.",
    activities: [
      { category: "meetings", label: "Sprint planning (2h)",          hours: 2.0 },
      { category: "coding",   label: "ZKP proof scaffolding",         hours: 1.5 },
      { category: "docs",     label: "Architecture notes",            hours: 0.5 },
    ],
  },
];

// ── Sidebar nav ───────────────────────────────────────────────────────────────

const SIDEBAR_NAV = [
  { label: "Dashboard",   href: "/dashboard"   },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Matching",    href: "/matching"    },
  { label: "Profile",     href: "/profile"     },
];

const WORKSPACE_NAV = [
  { label: "Work Diaries",  href: "/work-diaries",  active: true },
  { label: "Async Collab",  href: "/async-collab"               },
  { label: "Collaboration", href: "/collab"                     },
  { label: "Success Layer", href: "/success-layer"              },
  { label: "Quality Gate",  href: "/quality-gate"               },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const CAT_MAP: Record<ActivityCategory, { icon: React.ElementType; color: string; bg: string }> = {
  coding:   { icon: Code2,         color: "text-sky-400",    bg: "bg-sky-950/30"    },
  testing:  { icon: Zap,           color: "text-green-400",  bg: "bg-green-950/30"  },
  docs:     { icon: FileText,      color: "text-amber-400",  bg: "bg-amber-950/30"  },
  meetings: { icon: MessageSquare, color: "text-purple-400", bg: "bg-purple-950/30" },
  review:   { icon: BookOpen,      color: "text-zinc-400",   bg: "bg-zinc-800/40"   },
  break:    { icon: Coffee,        color: "text-zinc-600",   bg: "bg-zinc-900"      },
};

const MOOD_MAP = {
  productive: { label: "Productive",  dot: "bg-green-400",  text: "text-green-400"  },
  steady:     { label: "Steady",      dot: "bg-amber-400",  text: "text-amber-400"  },
  blocked:    { label: "Blocked",     dot: "bg-red-400",    text: "text-red-400"    },
};

function HoursBar({ hours, max }: { hours: number; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full bg-amber-500 rounded-full transition-all duration-700"
          style={{ width: `${(hours / max) * 100}%` }} />
      </div>
      <span className="font-mono text-[10px] tabular-nums text-zinc-500 w-8 text-right">{hours}h</span>
    </div>
  );
}

// ── DiaryCard ─────────────────────────────────────────────────────────────────

function DiaryCard({ entry }: { entry: DiaryEntry }) {
  const [open, setOpen] = useState(entry.day === "Today" || entry.day === "Yesterday");
  const mood = MOOD_MAP[entry.mood];
  const maxHours = Math.max(...entry.activities.map(a => a.hours));

  return (
    <div className={`border rounded-sm overflow-hidden ${
      entry.day === "Today" ? "border-amber-900/50 bg-amber-950/5" : "border-zinc-800 bg-zinc-900/40"
    }`}>
      {/* Header */}
      <div
        role="button" tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={(e) => e.key === "Enter" && setOpen(v => !v)}
        className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-zinc-900/40 transition-colors"
      >
        {/* Date block */}
        <div className="flex-shrink-0 w-14 text-center">
          <p className={`font-mono text-[10px] uppercase tracking-widest ${entry.day === "Today" ? "text-amber-400" : "text-zinc-500"}`}>
            {entry.day === "Today" || entry.day === "Yesterday" ? entry.day : entry.day.slice(0, 3)}
          </p>
          <p className="font-mono text-[9px] text-zinc-700">{entry.date.slice(5)}</p>
        </div>

        {/* Summary */}
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] text-zinc-400 leading-relaxed line-clamp-2">{entry.ai_summary}</p>
        </div>

        {/* Stats */}
        <div className="flex-shrink-0 flex items-center gap-3">
          <div className="text-center hidden sm:block">
            <p className="font-mono text-[9px] text-zinc-600 uppercase">Hrs</p>
            <p className="font-mono text-xs font-medium text-zinc-200 tabular-nums">{entry.total_hours}</p>
          </div>
          <div className="text-center hidden sm:block">
            <p className="font-mono text-[9px] text-zinc-600 uppercase">Commits</p>
            <p className="font-mono text-xs font-medium text-zinc-200 tabular-nums">{entry.commits}</p>
          </div>
          <div className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${mood.dot}`} />
            <span className={`font-mono text-[9px] hidden sm:inline ${mood.text}`}>{mood.label}</span>
          </div>
          {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />}
        </div>
      </div>

      {/* Expanded */}
      {open && (
        <div className="border-t border-zinc-800 bg-zinc-950/40 p-3 space-y-4">
          {/* AI summary */}
          <div className="flex items-start gap-2 border border-amber-900/30 bg-amber-950/10 rounded-sm p-2.5">
            <Zap className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="font-mono text-[10px] text-zinc-400 leading-relaxed">{entry.ai_summary}</p>
          </div>

          {/* Activity breakdown */}
          <div>
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Activity Breakdown</p>
            <div className="space-y-2">
              {entry.activities.map((a, i) => {
                const { icon: Icon, color, bg } = CAT_MAP[a.category];
                return (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className={`w-5 h-5 rounded-sm flex items-center justify-center flex-shrink-0 ${bg}`}>
                      <Icon className={`w-2.5 h-2.5 ${color}`} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="font-mono text-[10px] text-zinc-300 truncate">{a.label}</p>
                      <HoursBar hours={a.hours} max={maxHours} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Meta stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Total Hours",    value: `${entry.total_hours}h`   },
              { label: "Commits",        value: String(entry.commits)     },
              { label: "Files Touched",  value: String(entry.files_touched) },
            ].map(({ label, value }) => (
              <div key={label} className="border border-zinc-800 rounded-sm p-2">
                <p className="font-mono text-[9px] text-zinc-600 uppercase">{label}</p>
                <p className="font-mono text-sm font-medium text-zinc-200 tabular-nums mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Weekly summary bar ────────────────────────────────────────────────────────

function WeeklySummary({ entries }: { entries: DiaryEntry[] }) {
  const total  = entries.reduce((s, e) => s + e.total_hours, 0);
  const commits = entries.reduce((s, e) => s + e.commits, 0);
  const coding  = entries.flatMap(e => e.activities.filter(a => a.category === "coding"))
                         .reduce((s, a) => s + a.hours, 0);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {[
        { label: "Week Hours",    value: `${total}h`,             color: "text-amber-400" },
        { label: "Coding Hours",  value: `${coding.toFixed(1)}h`, color: "text-sky-400"   },
        { label: "Commits",       value: String(commits),         color: "text-green-400" },
        { label: "Days Logged",   value: String(entries.length),  color: "text-zinc-300"  },
      ].map(({ label, value, color }) => (
        <div key={label} className="border border-zinc-800 rounded-sm p-2.5 bg-zinc-900/40">
          <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">{label}</p>
          <p className={`font-mono text-base font-medium tabular-nums mt-0.5 ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkDiariesPage() {
  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      {/* Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-56 border-r border-zinc-800 bg-zinc-950 p-4 gap-6">
        <span className="font-mono text-xs text-zinc-500 uppercase tracking-widest">AiStaffApp</span>
        <nav className="flex flex-col gap-1">
          {SIDEBAR_NAV.map(({ label, href }) => (
            <Link key={label} href={href}
              className="px-3 py-2 rounded-sm font-mono text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
            >{label}</Link>
          ))}
        </nav>
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-700 uppercase tracking-widest px-3">Workspace</p>
          {WORKSPACE_NAV.map(({ label, href, active }) => (
            <Link key={label} href={href}
              className={`block px-3 py-1.5 rounded-sm font-mono text-xs transition-colors ${
                active ? "text-zinc-100 bg-zinc-800" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >{label}</Link>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-4 pb-20 lg:pb-4 max-w-3xl mx-auto w-full space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">Work Diaries</h1>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">AI-summarised progress · no screenshots</p>
          </div>
          <BookOpen className="w-5 h-5 text-amber-500" />
        </div>

        {/* Privacy callout */}
        <div className="border border-green-900/40 bg-green-950/10 rounded-sm p-3">
          <p className="font-mono text-[10px] text-green-500 uppercase tracking-widest mb-1">Privacy-First Tracking</p>
          <p className="font-mono text-xs text-zinc-400 leading-relaxed">
            No screenshots, no keystroke logging. The AI infers activity summaries from
            git commits, file change diffs, and calendar blocks — then surfaces them as
            plain-language progress notes visible to both talent and client.
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap">
          {(Object.entries(CAT_MAP) as [ActivityCategory, typeof CAT_MAP[ActivityCategory]][])
            .filter(([k]) => k !== "break")
            .map(([key, { icon: Icon, color }]) => (
              <span key={key} className="flex items-center gap-1 font-mono text-[9px] text-zinc-500">
                <Icon className={`w-3 h-3 ${color}`} />
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </span>
            ))}
        </div>

        {/* Weekly summary */}
        <WeeklySummary entries={DEMO_ENTRIES} />

        {/* Diary entries */}
        <div className="space-y-2">
          {DEMO_ENTRIES.map(e => <DiaryCard key={e.date} entry={e} />)}
        </div>
      </main>

      {/* Mobile nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-16 flex items-center border-t border-zinc-800 bg-zinc-950">
        {[
          { label: "Dash",    href: "/dashboard"   },
          { label: "Market",  href: "/marketplace" },
          { label: "Matching",href: "/matching"    },
          { label: "Profile", href: "/profile"     },
        ].map(({ label, href }) => (
          <Link key={label} href={href} className="nav-tab">
            <span className="text-[10px]">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
