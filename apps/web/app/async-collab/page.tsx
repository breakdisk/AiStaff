"use client";

import { useState } from "react";
import Link from "next/link";
import { Video, Globe, ArrowRight, MessageSquare, Zap, Clock, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";

// ── Types & demo data ─────────────────────────────────────────────────────────

interface VideoUpdate {
  id:          string;
  author:      string;
  role:        "talent" | "client";
  title:       string;
  duration_s:  number;
  recorded_at: string;
  timezone:    string;
  ai_summary:  string;
  tags:        string[];
  viewed:      boolean;
}

interface HandoffEntry {
  id:          string;
  phase:       string;
  from:        string;
  to:          string;
  date:        string;
  status:      "pending" | "in_review" | "accepted";
  deliverables: string[];
  notes:       string;
}

const DEMO_VIDEOS: VideoUpdate[] = [
  {
    id: "vid-001",
    author: "Marcus T.", role: "talent",
    title: "Auth layer complete — JWT refresh walkthrough",
    duration_s: 312, recorded_at: "2026-03-08T08:45:00Z", timezone: "UTC+2 (Berlin)",
    viewed: false,
    ai_summary: "Marcus walks through the completed JWT refresh token implementation. Covers token rotation strategy, Redis session store integration, and 3 edge cases handled. No blockers. ETA for milestone 3: on track.",
    tags: ["milestone-3", "auth", "no-blockers"],
  },
  {
    id: "vid-002",
    author: "Acme Corp", role: "client",
    title: "Feedback on Phase 2 deliverables + new requirement",
    duration_s: 187, recorded_at: "2026-03-07T14:20:00Z", timezone: "UTC-5 (New York)",
    viewed: true,
    ai_summary: "Client confirms Phase 2 agent.wasm accepted. Adds a new requirement: audit log must be append-only with tamper-evidence. Requests scoping estimate before proceeding to Phase 3.",
    tags: ["phase-2", "new-requirement", "audit-log"],
  },
  {
    id: "vid-003",
    author: "Marcus T.", role: "talent",
    title: "Wasmtime blocker resolved — demo of working host fn",
    duration_s: 224, recorded_at: "2026-03-06T18:10:00Z", timezone: "UTC+2 (Berlin)",
    viewed: true,
    ai_summary: "Documents the wasmtime 30 tuple param signature fix. Shows credential injection working end-to-end in the sandbox. Confirms no data leaks outside host function boundary.",
    tags: ["wasm", "blocker-resolved", "sandbox"],
  },
];

const DEMO_HANDOFFS: HandoffEntry[] = [
  {
    id: "hof-001",
    phase: "Phase 2 → Phase 3",
    from: "Marcus T.", to: "Acme Corp",
    date: "2026-03-05",
    status: "accepted",
    deliverables: ["agent.wasm (sha256: a4f9...)", "test suite (24 passing)", "deployment runbook v1"],
    notes: "All DoD checklist items met. Client confirmed acceptance on 2026-03-05. Escrow for Phase 2 released.",
  },
  {
    id: "hof-002",
    phase: "Phase 3 Handoff",
    from: "Marcus T.", to: "Acme Corp",
    date: "2026-03-08",
    status: "in_review",
    deliverables: ["live deployment URL", "DoD checklist 6/6", "monitoring dashboard config"],
    notes: "Awaiting client review. 30s veto window active. Escrow held pending approval.",
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
  { label: "Work Diaries",  href: "/work-diaries"              },
  { label: "Async Collab",  href: "/async-collab", active: true },
  { label: "Collaboration", href: "/collab"                    },
  { label: "Success Layer", href: "/success-layer"             },
  { label: "Quality Gate",  href: "/quality-gate"              },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const HANDOFF_STATUS = {
  pending:   { label: "Pending",   color: "text-zinc-500",   border: "border-zinc-700"  },
  in_review: { label: "In Review", color: "text-amber-400",  border: "border-amber-800" },
  accepted:  { label: "Accepted",  color: "text-green-400",  border: "border-green-800" },
};

// ── VideoCard ─────────────────────────────────────────────────────────────────

function VideoCard({ video }: { video: VideoUpdate }) {
  const [expanded, setExpanded] = useState(!video.viewed);

  return (
    <div className={`border rounded-sm overflow-hidden ${
      !video.viewed ? "border-amber-900/50 bg-amber-950/5" : "border-zinc-800 bg-zinc-900/40"
    }`}>
      <div
        role="button" tabIndex={0}
        onClick={() => setExpanded(v => !v)}
        onKeyDown={(e) => e.key === "Enter" && setExpanded(v => !v)}
        className="flex items-start gap-3 px-3 py-3 cursor-pointer hover:bg-zinc-900/30 transition-colors"
      >
        {/* Thumbnail placeholder */}
        <div className="w-20 h-12 bg-zinc-800 border border-zinc-700 rounded-sm flex-shrink-0 flex items-center justify-center relative">
          <Video className="w-5 h-5 text-zinc-600" />
          <span className="absolute bottom-1 right-1 font-mono text-[8px] text-zinc-500 bg-zinc-900 px-0.5 rounded">
            {fmtDuration(video.duration_s)}
          </span>
          {!video.viewed && (
            <span className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-mono text-xs font-medium ${!video.viewed ? "text-zinc-100" : "text-zinc-300"}`}>
              {video.title}
            </p>
            {!video.viewed && (
              <span className="font-mono text-[9px] px-1 border border-amber-800 text-amber-400 rounded-sm uppercase">New</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className={`font-mono text-[10px] ${video.role === "talent" ? "text-sky-400" : "text-purple-400"}`}>
              {video.author}
            </span>
            <span className="flex items-center gap-1 font-mono text-[9px] text-zinc-600">
              <Globe className="w-2.5 h-2.5" />{video.timezone}
            </span>
            <span className="flex items-center gap-1 font-mono text-[9px] text-zinc-600">
              <Clock className="w-2.5 h-2.5" />{video.recorded_at.slice(0, 10)}
            </span>
          </div>
        </div>

        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0 mt-1" />
          : <ChevronDown className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0 mt-1" />}
      </div>

      {expanded && (
        <div className="border-t border-zinc-800 bg-zinc-950/40 p-3 space-y-3">
          {/* AI summary */}
          <div className="flex items-start gap-2 border border-amber-900/30 bg-amber-950/10 rounded-sm p-2.5">
            <Zap className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-mono text-[9px] text-amber-500 uppercase tracking-widest mb-1">AI Summary</p>
              <p className="font-mono text-[10px] text-zinc-400 leading-relaxed">{video.ai_summary}</p>
            </div>
          </div>

          {/* Tags */}
          <div className="flex gap-1.5 flex-wrap">
            {video.tags.map(t => (
              <span key={t} className="font-mono text-[9px] text-zinc-500 border border-zinc-800 px-1.5 py-0.5 rounded-sm">
                #{t}
              </span>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button className="flex items-center gap-1.5 h-8 px-3 rounded-sm border border-zinc-700 text-zinc-300
                               font-mono text-[10px] uppercase tracking-widest hover:border-zinc-500 transition-colors">
              <Video className="w-3 h-3" /> Watch ({fmtDuration(video.duration_s)})
            </button>
            <button className="flex items-center gap-1.5 h-8 px-3 rounded-sm border border-zinc-700 text-zinc-500
                               font-mono text-[10px] uppercase tracking-widest hover:border-zinc-500 transition-colors">
              <MessageSquare className="w-3 h-3" /> Reply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── HandoffCard ───────────────────────────────────────────────────────────────

function HandoffCard({ entry }: { entry: HandoffEntry }) {
  const s = HANDOFF_STATUS[entry.status];

  return (
    <div className={`border rounded-sm p-3 ${
      entry.status === "in_review" ? "border-amber-900/50 bg-amber-950/5" : "border-zinc-800 bg-zinc-900/40"
    }`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <p className="font-mono text-xs font-medium text-zinc-100">{entry.phase}</p>
          <span className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border rounded-sm ${s.color} ${s.border}`}>
            {s.label}
          </span>
        </div>
        <span className="font-mono text-[9px] text-zinc-600">{entry.date}</span>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-[10px] text-sky-400">{entry.from}</span>
        <ArrowRight className="w-3 h-3 text-zinc-600" />
        <span className="font-mono text-[10px] text-purple-400">{entry.to}</span>
      </div>

      <div className="space-y-1 mb-2">
        {entry.deliverables.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <CheckCircle2 className={`w-3 h-3 flex-shrink-0 ${
              entry.status === "accepted" ? "text-green-400" : "text-zinc-600"
            }`} />
            <span className="font-mono text-[9px] text-zinc-400">{d}</span>
          </div>
        ))}
      </div>

      <p className="font-mono text-[9px] text-zinc-600 leading-relaxed">{entry.notes}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AsyncCollabPage() {
  const [tab, setTab] = useState<"videos" | "handoffs" | "compose">("videos");
  const [composing, setComposing] = useState(false);

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
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">Async Collaboration</h1>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">Video updates · structured handoffs · AI summaries</p>
          </div>
          <Video className="w-5 h-5 text-amber-500" />
        </div>

        {/* Timezone note */}
        <div className="border border-zinc-800 bg-zinc-900/40 rounded-sm p-3 flex items-center gap-3">
          <Globe className="w-4 h-4 text-zinc-500 flex-shrink-0" />
          <p className="font-mono text-[10px] text-zinc-400 leading-relaxed">
            Talent is in <span className="text-zinc-200">UTC+2 (Berlin)</span> ·
            Client is in <span className="text-zinc-200">UTC-5 (New York)</span> ·
            <span className="text-amber-400 ml-1">7h offset</span> — async-first workflow active
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Video Updates", value: String(DEMO_VIDEOS.length),              color: "text-sky-400"   },
            { label: "Unread",        value: String(DEMO_VIDEOS.filter(v => !v.viewed).length), color: "text-amber-400" },
            { label: "Handoffs",      value: String(DEMO_HANDOFFS.length),            color: "text-zinc-300"  },
          ].map(({ label, value, color }) => (
            <div key={label} className="border border-zinc-800 rounded-sm p-2.5 bg-zinc-900/40">
              <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">{label}</p>
              <p className={`font-mono text-base font-medium tabular-nums mt-0.5 ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800">
          {[
            { key: "videos"   as const, label: `Updates (${DEMO_VIDEOS.length})`   },
            { key: "handoffs" as const, label: `Handoffs (${DEMO_HANDOFFS.length})` },
            { key: "compose"  as const, label: "Record Update"                     },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-2 font-mono text-xs border-b-2 transition-colors ${
                tab === key ? "border-amber-500 text-amber-400" : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >{label}</button>
          ))}
        </div>

        {tab === "videos" && (
          <div className="space-y-2">
            {DEMO_VIDEOS.map(v => <VideoCard key={v.id} video={v} />)}
          </div>
        )}

        {tab === "handoffs" && (
          <div className="space-y-2">
            {DEMO_HANDOFFS.map(h => <HandoffCard key={h.id} entry={h} />)}
          </div>
        )}

        {tab === "compose" && (
          <div className="border border-zinc-800 rounded-sm p-4 space-y-4">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Record Async Update</p>

            <div className="border-2 border-dashed border-zinc-700 rounded-sm h-36 flex flex-col items-center justify-center gap-2 hover:border-zinc-600 transition-colors cursor-pointer"
              onClick={() => setComposing(true)}>
              <Video className="w-6 h-6 text-zinc-600" />
              <p className="font-mono text-[10px] text-zinc-500">Click to start recording</p>
              <p className="font-mono text-[9px] text-zinc-700">Max 10 min · AI summary generated automatically</p>
            </div>

            {composing && (
              <div className="border border-amber-900/50 bg-amber-950/10 rounded-sm p-3 flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <p className="font-mono text-xs text-amber-400">Recording… 0:07</p>
                <button onClick={() => setComposing(false)}
                  className="ml-auto h-7 px-2.5 rounded-sm border border-red-900 text-red-400 font-mono text-[9px] uppercase tracking-widest hover:border-red-700 transition-colors">
                  Stop
                </button>
              </div>
            )}

            <div className="space-y-2">
              <input placeholder="Update title…"
                className="w-full h-8 px-2.5 bg-zinc-900 border border-zinc-800 rounded-sm font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600" />
              <div className="flex gap-2">
                {["milestone-3", "blocker", "review-needed", "on-track"].map(tag => (
                  <button key={tag}
                    className="font-mono text-[9px] text-zinc-500 border border-zinc-800 px-1.5 py-0.5 rounded-sm hover:border-zinc-600 hover:text-zinc-300 transition-colors">
                    #{tag}
                  </button>
                ))}
              </div>
            </div>

            <button className="w-full h-9 rounded-sm border border-amber-800 bg-amber-950/30 text-amber-400
                               font-mono text-xs uppercase tracking-widest hover:border-amber-600 transition-colors">
              Post Update
            </button>
          </div>
        )}
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
