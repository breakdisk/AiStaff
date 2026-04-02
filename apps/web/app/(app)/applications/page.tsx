"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import type { ApplicationRow } from "@/app/api/freelancer/applications/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskEmail(email: string | null): string {
  if (!email) return "—";
  const at = email.indexOf("@");
  if (at < 0) return email.slice(0, 3) + "@…";
  return email.slice(0, Math.min(3, at)) + "@…";
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

type StatusFilter = "All" | "PENDING" | "ACCEPTED" | "REJECTED" | "DRAFT";
const FILTERS: StatusFilter[] = ["All", "PENDING", "ACCEPTED", "REJECTED"];

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  if (s === "ACCEPTED") {
    return (
      <span className="font-mono text-[10px] border border-emerald-800 text-emerald-400 px-1.5 py-0.5 rounded-sm">
        ACCEPTED
      </span>
    );
  }
  if (s === "REJECTED") {
    return (
      <span className="font-mono text-[10px] border border-zinc-700 text-zinc-500 px-1.5 py-0.5 rounded-sm line-through">
        REJECTED
      </span>
    );
  }
  if (s === "DRAFT") {
    return (
      <span className="font-mono text-[10px] border border-zinc-700 text-zinc-500 px-1.5 py-0.5 rounded-sm">
        DRAFT
      </span>
    );
  }
  return (
    <span className="font-mono text-[10px] border border-amber-800 text-amber-400 px-1.5 py-0.5 rounded-sm">
      PENDING
    </span>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="border border-zinc-800 rounded-sm p-4 bg-zinc-900/40 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-3 w-48 bg-zinc-800 rounded-sm" />
        <div className="h-4 w-16 bg-zinc-800 rounded-sm" />
      </div>
      <div className="h-2.5 w-32 bg-zinc-800 rounded-sm" />
      <div className="flex gap-4">
        <div className="h-2.5 w-20 bg-zinc-800 rounded-sm" />
        <div className="h-2.5 w-20 bg-zinc-800 rounded-sm" />
      </div>
    </div>
  );
}

// ── Application card ──────────────────────────────────────────────────────────

function AppCard({ row }: { row: ApplicationRow }) {
  const status = row.status.toUpperCase();
  return (
    <div className="border border-zinc-800 rounded-sm p-4 bg-zinc-900/40 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <p className={`font-mono text-xs font-medium ${status === "REJECTED" ? "text-zinc-500 line-through" : "text-zinc-100"} leading-tight`}>
          {row.job_title}
        </p>
        <StatusBadge status={row.status} />
      </div>

      {row.listing_name && row.listing_name !== row.job_title && (
        <p className="font-mono text-[10px] text-zinc-500 truncate">
          {row.listing_name}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[10px] text-zinc-500">
          Budget: <span className="text-zinc-300">{row.proposed_budget || "—"}</span>
        </span>
        <span className="font-mono text-[10px] text-zinc-500">
          Timeline: <span className="text-zinc-300">{row.proposed_timeline || "—"}</span>
        </span>
        {row.client_email && (
          <span className="font-mono text-[10px] text-zinc-500">
            Client: <span className="text-zinc-400">{maskEmail(row.client_email)}</span>
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] text-zinc-600">
          {relativeTime(row.submitted_at)}
        </p>
        {status === "ACCEPTED" && (
          <Link
            href="/engagements"
            className="font-mono text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            View Engagement →
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ApplicationsPage() {
  const [rows,    setRows]    = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [filter,  setFilter]  = useState<StatusFilter>("All");

  useEffect(() => {
    fetch("/api/freelancer/applications")
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<ApplicationRow[]>;
      })
      .then(setRows)
      .catch(e => setError(e.message ?? "Failed to load applications"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === "All"
    ? rows
    : rows.filter(r => r.status.toUpperCase() === filter);

  const total    = rows.length;
  const pending  = rows.filter(r => r.status.toUpperCase() === "PENDING").length;
  const accepted = rows.filter(r => r.status.toUpperCase() === "ACCEPTED").length;

  return (
    <main className="flex-1 pb-20 lg:pb-0 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
        <FileText className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <div>
          <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
            My Applications
          </h1>
          {!loading && !error && (
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">
              {total} total · {pending} pending · {accepted} accepted
            </p>
          )}
        </div>
      </div>

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

        {!loading && !error && filtered.length === 0 && (
          <p className="font-mono text-xs text-zinc-500 text-center py-10">
            No {filter !== "All" ? filter.toLowerCase() : ""} applications.
          </p>
        )}

        {!loading && !error && filtered.map(row => (
          <AppCard key={row.id} row={row} />
        ))}
      </div>
    </main>
  );
}
