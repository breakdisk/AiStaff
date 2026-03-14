"use client";

import { useState } from "react";
import {
  Users, Plus, ChevronDown, Check, X, Trash2, CheckCheck,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ApprovalStatus = "approved" | "pending" | "rejected";

interface PoolTalent {
  id:          string;
  name:        string;
  trustTier:   number;
  skills:      string[];
  matchScore:  number;
  status:      ApprovalStatus;
  addedAt:     string;
  addedReason: string;
}

type TabKey = "approved" | "pending" | "rejected";

// ── Demo data ─────────────────────────────────────────────────────────────────

const INITIAL_POOL: PoolTalent[] = [
  { id: "t-01", name: "Alexei V.", trustTier: 2, skills: ["rust", "wasm", "kafka"],  matchScore: 0.92, status: "approved", addedAt: "2026-02-14", addedReason: "Referred by engineering lead" },
  { id: "t-02", name: "Priya M.",  trustTier: 2, skills: ["rust", "kafka"],          matchScore: 0.87, status: "approved", addedAt: "2026-02-20", addedReason: "Passed internal technical screening" },
  { id: "t-03", name: "Omar K.",   trustTier: 1, skills: ["wasm", "python"],          matchScore: 0.81, status: "approved", addedAt: "2026-02-28", addedReason: "Recommended by CSM" },
  { id: "t-04", name: "Sara L.",   trustTier: 2, skills: ["python", "kafka"],         matchScore: 0.79, status: "pending",  addedAt: "2026-03-05", addedReason: "Strong portfolio review" },
  { id: "t-05", name: "James T.",  trustTier: 1, skills: ["python", "mlflow"],        matchScore: 0.75, status: "pending",  addedAt: "2026-03-06", addedReason: "Referred by talent@acme.com" },
  { id: "t-06", name: "Mei X.",    trustTier: 1, skills: ["rust"],                    matchScore: 0.68, status: "pending",  addedAt: "2026-03-07", addedReason: "Pending trust score upgrade" },
  { id: "t-07", name: "David R.",  trustTier: 1, skills: ["python"],                  matchScore: 0.55, status: "rejected", addedAt: "2026-02-10", addedReason: "Trust score too low" },
  { id: "t-08", name: "Lena S.",   trustTier: 0, skills: ["figma"],                   matchScore: 0.42, status: "rejected", addedAt: "2026-02-15", addedReason: "Skills don't match requirements" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  if (status === "approved") return (
    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm border border-green-800 text-green-400">APPROVED</span>
  );
  if (status === "pending") return (
    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm border border-amber-800 text-amber-400">PENDING</span>
  );
  return (
    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm border border-zinc-700 text-zinc-500">REJECTED</span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct   = Math.round(score * 100);
  const color = pct >= 85 ? "bg-green-500" : pct >= 70 ? "bg-amber-500" : "bg-zinc-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1 bg-zinc-800 rounded-full overflow-hidden flex-shrink-0">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[10px] text-zinc-500 tabular-nums">{pct}%</span>
    </div>
  );
}

function TalentPoolRow({
  talent,
  onApprove,
  onReject,
  onRemove,
}: {
  talent:    PoolTalent;
  onApprove: (id: string) => void;
  onReject:  (id: string) => void;
  onRemove:  (id: string) => void;
}) {
  const [flash, setFlash] = useState<"approve" | "reject" | "remove" | null>(null);

  function act(type: "approve" | "reject" | "remove") {
    setFlash(type);
    setTimeout(() => {
      setFlash(null);
      if (type === "approve") onApprove(talent.id);
      else if (type === "reject") onReject(talent.id);
      else onRemove(talent.id);
    }, 700);
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 py-2.5 border-b border-zinc-800 last:border-0">
      {/* Avatar + info */}
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <div className="w-8 h-8 rounded-sm bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
          <span className="font-mono text-xs text-zinc-300">{talent.name[0]}</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-mono text-xs text-zinc-200 truncate">{talent.name}</p>
            <span className="font-mono text-[9px] px-1 rounded-sm border border-zinc-700 text-zinc-500 flex-shrink-0">T{talent.trustTier}</span>
            <ApprovalBadge status={talent.status} />
          </div>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {talent.skills.map((s) => (
              <span key={s} className="font-mono text-[9px] text-zinc-600 bg-zinc-800 px-1 rounded-sm">{s}</span>
            ))}
          </div>
          <p className="font-mono text-[9px] text-zinc-600 mt-0.5">
            Added {talent.addedAt} · {talent.addedReason}
          </p>
        </div>
      </div>

      {/* Match score */}
      <div className="flex-shrink-0 hidden sm:block">
        <ScoreBar score={talent.matchScore} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {talent.status === "pending" && (
          <>
            <button
              onClick={() => act("approve")}
              disabled={flash !== null}
              className={`flex items-center gap-1 h-7 px-2 rounded-sm font-mono text-[10px] border transition-colors ${
                flash === "approve"
                  ? "border-green-800 bg-green-950 text-green-400"
                  : "border-green-900 text-green-500 hover:bg-green-950/30"
              }`}
            >
              <Check className="w-3 h-3" />
              {flash === "approve" ? "Done" : "Approve"}
            </button>
            <button
              onClick={() => act("reject")}
              disabled={flash !== null}
              className={`flex items-center gap-1 h-7 px-2 rounded-sm font-mono text-[10px] border transition-colors ${
                flash === "reject"
                  ? "border-zinc-600 bg-zinc-800 text-zinc-400"
                  : "border-zinc-700 text-zinc-500 hover:bg-zinc-900"
              }`}
            >
              <X className="w-3 h-3" />
              {flash === "reject" ? "Done" : "Reject"}
            </button>
          </>
        )}
        {talent.status === "approved" && (
          <button
            onClick={() => act("remove")}
            disabled={flash !== null}
            className={`flex items-center gap-1 h-7 px-2 rounded-sm font-mono text-[10px] border transition-colors ${
              flash === "remove"
                ? "border-red-900 bg-red-950 text-red-400"
                : "border-zinc-700 text-zinc-500 hover:border-red-900 hover:text-red-400"
            }`}
          >
            <Trash2 className="w-3 h-3" />
            {flash === "remove" ? "Removed" : "Remove"}
          </button>
        )}
        {talent.status === "rejected" && (
          <button
            onClick={() => act("approve")}
            disabled={flash !== null}
            className="flex items-center gap-1 h-7 px-2 rounded-sm font-mono text-[10px] border border-zinc-700 text-zinc-500 hover:border-green-900 hover:text-green-400 transition-colors"
          >
            <Check className="w-3 h-3" /> Reinstate
          </button>
        )}
      </div>
    </div>
  );
}

function AddCandidateAccordion({ onAdd }: { onAdd: (t: PoolTalent) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ id: "", reason: "" });
  const [saved, setSaved] = useState(false);

  function handleSubmit() {
    if (!form.id.trim()) return;
    const newTalent: PoolTalent = {
      id:          `t-new-${Date.now()}`,
      name:        form.id.startsWith("tal-") ? "New Candidate" : form.id,
      trustTier:   0,
      skills:      [],
      matchScore:  0,
      status:      "pending",
      addedAt:     new Date().toISOString().split("T")[0],
      addedReason: form.reason || "Added manually",
    };
    onAdd(newTalent);
    setSaved(true);
    setTimeout(() => { setSaved(false); setOpen(false); setForm({ id: "", reason: "" }); }, 1500);
  }

  return (
    <div className="border border-zinc-800 rounded-sm overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => e.key === "Enter" && setOpen((v) => !v)}
        className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-zinc-900 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Plus className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-mono text-xs text-zinc-300">Add Candidate to Pool</span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-zinc-600 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>

      {open && (
        <div className="border-t border-zinc-800 p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">Talent ID or Email</label>
              <input
                className="w-full bg-zinc-900 border border-zinc-700 rounded-sm px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-amber-700 placeholder-zinc-700"
                placeholder="tal-xxx or talent@email.com"
                value={form.id}
                onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
              />
            </div>
            <div>
              <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">Reason / Notes</label>
              <input
                className="w-full bg-zinc-900 border border-zinc-700 rounded-sm px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-amber-700 placeholder-zinc-700"
                placeholder="e.g. Passed internal screening"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={saved || !form.id.trim()}
              className={`flex-1 h-8 rounded-sm font-mono text-xs border transition-all ${
                saved
                  ? "border-green-800 bg-green-950 text-green-400"
                  : "border-amber-800 bg-amber-950 text-amber-400 hover:bg-amber-900 disabled:opacity-40"
              }`}
            >
              {saved ? "✓ Added to Pending" : "Add to Pending Review"}
            </button>
            <button onClick={() => setOpen(false)}
              className="h-8 px-3 rounded-sm border border-zinc-700 text-zinc-500 font-mono text-xs hover:border-zinc-500 transition-colors"
            >Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar() {
  return (
    <aside className="hidden lg:flex lg:flex-col w-56 border-r border-zinc-800 bg-zinc-950 p-4 gap-6">
      <span className="font-mono text-xs text-zinc-500 uppercase tracking-widest">AiStaffApp</span>
      <nav className="flex flex-col gap-1">
        {[
          { label: "Dashboard",   href: "/dashboard"   },
          { label: "Marketplace", href: "/marketplace" },
          { label: "Leaderboard", href: "/leaderboard" },
          { label: "Matching",    href: "/matching"    },
          { label: "Profile",     href: "/profile"     },
        ].map(({ label, href }) => (
          <a key={label} href={href}
            className="px-3 py-2 rounded-sm font-mono text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
          >{label}</a>
        ))}
      </nav>
      {[
        { label: "Payments",      items: [["Escrow","/escrow"],["Payouts","/payouts"],["Billing","/billing"],["Smart Contracts","/smart-contracts"],["Outcome Listings","/outcome-listings"],["Pricing Calculator","/pricing-calculator"]] },
        { label: "Workspace",     items: [["Work Diaries","/work-diaries"],["Async Collab","/async-collab"],["Collaboration","/collab"],["Success Layer","/success-layer"],["Quality Gate","/quality-gate"]] },
        { label: "Legal",         items: [["Legal Toolkit","/legal-toolkit"],["Tax Engine","/tax-engine"],["Reputation","/reputation-export"],["Transparency","/transparency"]] },
        { label: "Notifications", items: [["Alerts","/notifications"],["Reminders","/reminders"],["Settings","/notification-settings"]] },
        { label: "Enterprise",    items: [["Industry Suites","/vertical"],["Enterprise Hub","/enterprise"],["Talent Pools","/enterprise/talent-pools"],["SLA Dashboard","/enterprise/sla"],["Global & Access","/global"]] },
      ].map(({ label, items }) => (
        <div key={label} className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">{label}</p>
          {items.map(([lbl, href]) => (
            <a key={lbl} href={href}
              className={`block px-3 py-1.5 rounded-sm font-mono text-xs transition-colors ${
                lbl === "Talent Pools"
                  ? "text-zinc-100 bg-zinc-800"
                  : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >{lbl}</a>
          ))}
        </div>
      ))}
    </aside>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TalentPoolsPage() {
  const [pool, setPool]     = useState<PoolTalent[]>(INITIAL_POOL);
  const [tab, setTab]       = useState<TabKey>("approved");

  function approve(id: string) { setPool((p) => p.map((t) => t.id === id ? { ...t, status: "approved" } : t)); }
  function reject(id: string)  { setPool((p) => p.map((t) => t.id === id ? { ...t, status: "rejected" } : t)); }
  function remove(id: string)  { setPool((p) => p.filter((t) => t.id !== id)); }
  function add(t: PoolTalent)  { setPool((p) => [t, ...p]); setTab("pending"); }

  function approveAll() {
    setPool((p) => p.map((t) => t.status === "pending" ? { ...t, status: "approved" } : t));
  }

  const approved = pool.filter((t) => t.status === "approved");
  const pending  = pool.filter((t) => t.status === "pending");
  const rejected = pool.filter((t) => t.status === "rejected");

  const tabData = { approved, pending, rejected };
  const current = tabData[tab];

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: "approved", label: "Approved", count: approved.length },
    { key: "pending",  label: "Pending Review", count: pending.length },
    { key: "rejected", label: "Rejected", count: rejected.length },
  ];

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Sidebar />

      <main className="flex-1 p-4 pb-20 lg:pb-4 space-y-4 max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-amber-400" />
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
              Custom Talent Pool
            </h1>
          </div>
          <span className="font-mono text-[10px] text-zinc-500">{pool.length} total candidates</span>
        </div>

        {/* Add candidate */}
        <AddCandidateAccordion onAdd={add} />

        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-zinc-800">
          {TABS.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`font-mono text-xs px-3 py-2.5 border-b-2 transition-colors ${
                tab === key
                  ? "border-amber-400 text-amber-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label}
              <span className="ml-1.5 text-[10px] text-zinc-600">({count})</span>
            </button>
          ))}
        </div>

        {/* Bulk approve (pending tab only) */}
        {tab === "pending" && pending.length > 0 && (
          <div className="flex justify-end">
            <button
              onClick={approveAll}
              className="flex items-center gap-1.5 h-7 px-3 rounded-sm font-mono text-[10px] border border-green-900 text-green-500 hover:bg-green-950/30 transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Approve all ({pending.length})
            </button>
          </div>
        )}

        {/* List */}
        <div className="border border-zinc-800 rounded-sm px-3">
          {current.length === 0 ? (
            <p className="font-mono text-xs text-zinc-600 py-6 text-center">
              No {tab} candidates
            </p>
          ) : (
            current.map((t) => (
              <TalentPoolRow
                key={t.id}
                talent={t}
                onApprove={approve}
                onReject={reject}
                onRemove={remove}
              />
            ))
          )}
        </div>

        {/* Legend */}
        <p className="font-mono text-[10px] text-zinc-700 px-1">
          Approved talent can be assigned to any deployment in your org. Pending candidates require manual review before activation.
        </p>
      </main>
    </div>
  );
}
