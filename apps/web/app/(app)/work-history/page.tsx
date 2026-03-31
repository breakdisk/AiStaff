"use client";

import { useEffect, useState, useMemo } from "react";
import { Archive } from "lucide-react";
import type { WorkHistoryRow } from "@/app/api/freelancer/work-history/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function fmtMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

type StateFilter = "All" | "Active" | "Completed" | "Failed";

const FILTERS: StateFilter[] = ["All", "Active", "Completed", "Failed"];

function matchesFilter(state: string, filter: StateFilter): boolean {
  const s = state.toUpperCase();
  if (filter === "All") return true;
  if (filter === "Completed") return s === "RELEASED";
  if (filter === "Failed") return s === "VETOED" || s === "FAILED";
  if (filter === "Active") return s !== "RELEASED" && s !== "VETOED" && s !== "FAILED";
  return true;
}

// ── State badge ───────────────────────────────────────────────────────────────

function StateBadge({ state }: { state: string }) {
  const s = state.toUpperCase();

  if (s === "RELEASED") {
    return (
      <span className="font-mono text-[10px] border border-emerald-800 text-emerald-400 px-1.5 py-0.5 rounded-sm">
        COMPLETED
      </span>
    );
  }
  if (s === "VETOED") {
    return (
      <span className="font-mono text-[10px] border border-red-800 text-red-400 px-1.5 py-0.5 rounded-sm">
        VETOED
      </span>
    );
  }
  if (s === "FAILED") {
    return (
      <span className="font-mono text-[10px] border border-red-900 text-red-500 px-1.5 py-0.5 rounded-sm">
        FAILED
      </span>
    );
  }
  if (s === "VETO_WINDOW") {
    return (
      <span className="font-mono text-[10px] border border-amber-800 text-amber-400 px-1.5 py-0.5 rounded-sm">
        VETO WINDOW
      </span>
    );
  }
  if (s === "PENDING" || s === "PROVISIONING" || s === "INSTALLING" || s === "VERIFYING") {
    return (
      <span className="font-mono text-[10px] border border-amber-900 text-amber-500 px-1.5 py-0.5 rounded-sm">
        {s}
      </span>
    );
  }
  return (
    <span className="font-mono text-[10px] border border-zinc-700 text-zinc-500 px-1.5 py-0.5 rounded-sm">
      {state}
    </span>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="border border-zinc-800 rounded-sm p-4 bg-zinc-900/40 space-y-3 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="h-3 w-48 bg-zinc-800 rounded-sm" />
        <div className="h-4 w-20 bg-zinc-800 rounded-sm" />
      </div>
      <div className="flex gap-4">
        <div className="h-2.5 w-20 bg-zinc-800 rounded-sm" />
        <div className="h-2.5 w-20 bg-zinc-800 rounded-sm" />
      </div>
      <div className="h-1.5 w-full bg-zinc-800 rounded-sm" />
      <div className="h-2.5 w-32 bg-zinc-800 rounded-sm" />
    </div>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-800 rounded-sm p-3 bg-zinc-900/40 space-y-1">
      <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{label}</p>
      <p className="font-mono text-lg font-medium text-amber-400 tabular-nums">{value}</p>
    </div>
  );
}

// ── Work history card ─────────────────────────────────────────────────────────

function HistoryCard({ row }: { row: WorkHistoryRow }) {
  const pct = row.milestones_total > 0
    ? Math.round((row.milestones_approved / row.milestones_total) * 100)
    : 0;

  return (
    <div className="border border-zinc-800 rounded-sm p-4 bg-zinc-900/40 space-y-2.5">
      {/* Title + state */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs font-medium text-zinc-100 leading-tight truncate">
            {row.job_title}
          </p>
          {row.category && (
            <span className="font-mono text-[9px] border border-zinc-800 text-zinc-600 px-1.5 py-0.5 rounded-sm mt-1 inline-block">
              {row.category}
            </span>
          )}
        </div>
        <StateBadge state={row.state} />
      </div>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-3">
        {row.client_masked && (
          <span className="font-mono text-[10px] text-zinc-500">
            Client: <span className="text-zinc-400">{row.client_masked}</span>
          </span>
        )}
        <span className="font-mono text-[10px] text-emerald-400 font-medium">
          {usd(row.escrow_amount_cents)}
        </span>
      </div>

      {/* Milestone progress */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] text-zinc-500">
            Milestones: {row.milestones_approved}/{row.milestones_total} approved
          </p>
          <p className="font-mono text-[10px] text-zinc-600">{pct}%</p>
        </div>
        <div className="h-1 w-full bg-zinc-800 rounded-sm overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-sm transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] text-zinc-600">
          Started {fmtMonthYear(row.created_at)} · updated {relativeTime(row.updated_at)}
        </p>
        <p className="font-mono text-[10px] text-zinc-700 select-all">
          {row.deployment_id.slice(0, 8)}…
        </p>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkHistoryPage() {
  const [rows,    setRows]    = useState<WorkHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [filter,  setFilter]  = useState<StateFilter>("All");

  useEffect(() => {
    fetch("/api/freelancer/work-history")
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<WorkHistoryRow[]>;
      })
      .then(setRows)
      .catch(e => setError(e.message ?? "Failed to load work history"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => rows.filter(r => matchesFilter(r.state, filter)),
    [rows, filter],
  );

  const completedRows = rows.filter(r => r.state.toUpperCase() === "RELEASED");
  const vetoed        = rows.filter(r => ["VETOED", "FAILED"].includes(r.state.toUpperCase())).length;
  const completed     = completedRows.length;
  const eligible      = completed + vetoed;
  const completionPct = eligible > 0 ? Math.round((completed / eligible) * 100) : 0;
  const totalEarned   = completedRows.reduce((s, r) => s + r.escrow_amount_cents, 0);

  return (
    <main className="flex-1 pb-20 lg:pb-0 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
        <Archive className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
          Work History
        </h1>
      </div>

      {/* Stats */}
      {!loading && !error && rows.length > 0 && (
        <div className="px-4 py-3 border-b border-zinc-800 grid grid-cols-3 gap-2">
          <StatTile label="Total Earned"     value={usd(totalEarned)} />
          <StatTile label="Deployments"      value={String(rows.length)} />
          <StatTile label="Completion Rate"  value={`${completionPct}%`} />
        </div>
      )}

      {/* Filter tabs */}
      <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-1.5 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`font-mono text-[10px] px-2.5 py-1 rounded-sm border transition-colors ${
              filter === f
                ? "border-amber-800 bg-amber-950/50 text-amber-400"
                : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {loading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {!loading && error && (
          <p className="font-mono text-xs text-red-400 text-center py-8">{error}</p>
        )}

        {!loading && !error && rows.length === 0 && (
          <p className="font-mono text-xs text-zinc-500 text-center py-10 max-w-xs mx-auto">
            No deployments yet. Your work history appears here after your first engagement.
          </p>
        )}

        {!loading && !error && rows.length > 0 && filtered.length === 0 && (
          <p className="font-mono text-xs text-zinc-500 text-center py-10">
            No {filter.toLowerCase()} deployments.
          </p>
        )}

        {!loading && !error && filtered.map(row => (
          <HistoryCard key={row.deployment_id} row={row} />
        ))}
      </div>
    </main>
  );
}
