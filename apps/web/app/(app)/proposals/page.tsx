"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Star, AlertTriangle, X, CheckCircle2, XCircle, Clock, Send, Filter,
} from "lucide-react";

import { SubScoreBar } from "@/components/SubScoreBar";
import { VettingBadge } from "@/components/VettingBadge";
import type { ReceivedProposal } from "@/app/api/proposals/received/route";
import type { ApplicationRow } from "@/app/api/freelancer/applications/route";

// ── Score computation from text heuristics ────────────────────────────────────

function computeScores(p: ReceivedProposal) {
  const coverWords = p.cover_letter.split(/\s+/).filter(Boolean).length;
  const techWords  = p.technical_approach.split(/\s+/).filter(Boolean).length;
  const dlvCount   = Array.isArray(p.key_deliverables) ? p.key_deliverables.length : 0;

  const brief_understanding = Math.min(100, Math.round(coverWords / 2));
  const portfolio_relevance = Math.min(100, Math.round((techWords + dlvCount * 8) / 2));
  const price_fit           = 70;
  const originality         = Math.min(100, Math.round((coverWords + techWords) / 4));
  const overall_score       = Math.round(
    (brief_understanding + portfolio_relevance + price_fit + originality) / 4,
  );
  return {
    brief_understanding,
    portfolio_relevance,
    price_fit,
    originality,
    overall_score,
    cover_length:        coverWords + techWords,
    top_pick:            overall_score >= 70,
    ai_generated_likely: coverWords < 40 && techWords < 20,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short",
  });
}

function scoreTextColor(s: number) {
  if (s >= 70) return "text-green-400";
  if (s >= 45) return "text-amber-400";
  return "text-red-400";
}

function scoreColor(s: number): "green" | "amber" | "red" {
  if (s >= 70) return "green";
  if (s >= 45) return "amber";
  return "red";
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-3 py-3 border-b border-zinc-800 animate-pulse">
      <div className="w-9 h-9 rounded-sm bg-zinc-800 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-2/3 rounded bg-zinc-800" />
        <div className="h-2.5 w-1/3 rounded bg-zinc-800" />
      </div>
      <div className="hidden sm:block w-16 h-3 rounded bg-zinc-800" />
    </div>
  );
}

// ── CLIENT VIEW ───────────────────────────────────────────────────────────────

function ReceivedRow({
  p,
  onSelect,
}: {
  p: ReceivedProposal;
  onSelect: (p: ReceivedProposal) => void;
}) {
  const scores = computeScores(p);
  const initial = p.freelancer_email.charAt(0).toUpperCase();

  return (
    <button
      onClick={() => onSelect(p)}
      className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-b
                  border-zinc-800 last:border-0 hover:bg-zinc-900 ${
        scores.top_pick ? "bg-zinc-900/40" : ""
      }`}
    >
      <div className={`w-9 h-9 rounded-sm border flex items-center justify-center flex-shrink-0 ${
        scores.top_pick
          ? "border-green-800 bg-green-950/30"
          : scores.ai_generated_likely
          ? "border-red-900 bg-red-950/20"
          : "border-zinc-800"
      }`}>
        <span className={`font-mono text-sm font-medium tabular-nums ${scoreTextColor(scores.overall_score)}`}>
          {scores.overall_score}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs font-medium text-zinc-100">{initial}.</span>
          <VettingBadge tier={p.identity_tier as 0 | 1 | 2} compact />
          {scores.top_pick && (
            <span className="font-mono text-[9px] border border-green-800 text-green-400 px-1.5 py-0.5 rounded-sm flex items-center gap-1">
              <Star className="w-2.5 h-2.5" />TOP PICK
            </span>
          )}
          {scores.ai_generated_likely && (
            <span className="font-mono text-[9px] border border-red-900 text-red-400 px-1.5 py-0.5 rounded-sm flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5" />LOW QUALITY
            </span>
          )}
          {p.status !== "PENDING" && (
            <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded-sm border ${
              p.status === "ACCEPTED"
                ? "border-emerald-800 text-emerald-400"
                : "border-zinc-700 text-zinc-500"
            }`}>
              {p.status}
            </span>
          )}
        </div>
        <p className="font-mono text-[10px] text-zinc-500 mt-0.5 truncate">{p.job_title}</p>
        <p className="font-mono text-[10px] text-zinc-600 mt-1 line-clamp-1 italic">
          {p.cover_letter.slice(0, 80)}…
        </p>
      </div>

      <div className="text-right flex-shrink-0 hidden sm:block">
        <p className="font-mono text-xs text-zinc-300">{p.proposed_budget}</p>
        <p className="font-mono text-[10px] text-zinc-600">{fmtDate(p.submitted_at)}</p>
      </div>
    </button>
  );
}

function ReceivedDetailPanel({
  p,
  onClose,
  onAction,
}: {
  p: ReceivedProposal;
  onClose: () => void;
  onAction: (id: string, status: "ACCEPTED" | "REJECTED") => Promise<void>;
}) {
  const scores  = computeScores(p);
  const [acting, setActing] = useState<"ACCEPTED" | "REJECTED" | null>(null);
  const [done,   setDone]   = useState<string | null>(
    p.status !== "PENDING" ? p.status : null,
  );
  const [error,  setError]  = useState<string | null>(null);

  const act = async (status: "ACCEPTED" | "REJECTED") => {
    setActing(status);
    setError(null);
    try {
      await onAction(p.id, status);
      setDone(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed — please retry");
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-zinc-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-sm bg-zinc-950 border-l border-zinc-800 flex flex-col overflow-y-auto">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
          <div className="flex-1 min-w-0">
            <p className="font-mono text-xs font-medium text-zinc-100">{p.job_title}</p>
            <p className="font-mono text-[10px] text-zinc-500 truncate">{p.freelancer_email}</p>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Score */}
          <div className="text-center py-2">
            <p className={`font-mono text-4xl font-medium tabular-nums ${scoreTextColor(scores.overall_score)}`}>
              {scores.overall_score}
            </p>
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mt-1">
              Quality Score
            </p>
          </div>

          {/* Breakdown */}
          <div className="space-y-2">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Breakdown</p>
            <SubScoreBar label="Cover Letter Depth"  score={scores.brief_understanding} color={scoreColor(scores.brief_understanding)} />
            <SubScoreBar label="Technical Detail"    score={scores.portfolio_relevance} color={scoreColor(scores.portfolio_relevance)} />
            <SubScoreBar label="Price Alignment"     score={scores.price_fit}           color={scoreColor(scores.price_fit)} />
            <SubScoreBar label="Specificity"         score={scores.originality}         color={scoreColor(scores.originality)} />
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Budget",    value: p.proposed_budget    },
              { label: "Timeline",  value: p.proposed_timeline  },
              { label: "Submitted", value: fmtDate(p.submitted_at) },
              { label: "Identity",  value: `Tier ${p.identity_tier}` },
            ].map(({ label, value }) => (
              <div key={label} className="border border-zinc-800 rounded-sm p-2 bg-zinc-900">
                <p className="font-mono text-[10px] text-zinc-600 uppercase">{label}</p>
                <p className="font-mono text-xs text-zinc-300 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Cover letter */}
          <div className="border border-zinc-800 rounded-sm p-3 bg-zinc-900/50">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Cover Letter</p>
            <p className="font-mono text-xs text-zinc-400 leading-relaxed">{p.cover_letter}</p>
          </div>

          {p.technical_approach && (
            <div className="border border-zinc-800 rounded-sm p-3 bg-zinc-900/50">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Technical Approach</p>
              <p className="font-mono text-xs text-zinc-400 leading-relaxed">{p.technical_approach}</p>
            </div>
          )}

          {p.key_deliverables && p.key_deliverables.length > 0 && (
            <div className="border border-zinc-800 rounded-sm p-3 bg-zinc-900/50">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Key Deliverables</p>
              <ul className="space-y-1">
                {p.key_deliverables.map((d, i) => (
                  <li key={i} className="font-mono text-xs text-zinc-400 flex items-start gap-1.5">
                    <span className="text-amber-400 flex-shrink-0 mt-0.5">·</span>{d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          {error && <p className="font-mono text-xs text-red-500">{error}</p>}
          {done ? (
            <div className={`h-10 rounded-sm border flex items-center justify-center gap-2 font-mono text-xs ${
              done === "ACCEPTED"
                ? "border-emerald-800 text-emerald-400"
                : "border-zinc-700 text-zinc-500"
            }`}>
              {done === "ACCEPTED"
                ? <><CheckCircle2 className="w-3.5 h-3.5" />Accepted</>
                : <><XCircle     className="w-3.5 h-3.5" />Declined</>
              }
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => act("ACCEPTED")}
                disabled={!!acting}
                className="w-full h-10 rounded-sm border border-emerald-900 bg-emerald-950/30
                           text-emerald-400 font-mono text-xs uppercase tracking-widest
                           hover:border-emerald-700 disabled:opacity-50 transition-colors"
              >
                {acting === "ACCEPTED" ? "Accepting…" : "Accept Proposal"}
              </button>
              <button
                onClick={() => act("REJECTED")}
                disabled={!!acting}
                className="w-full h-9 rounded-sm border border-zinc-700 text-zinc-400
                           font-mono text-xs uppercase tracking-widest
                           hover:border-red-900 hover:text-red-400 disabled:opacity-50 transition-colors"
              >
                {acting === "REJECTED" ? "Declining…" : "Decline"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── FREELANCER VIEW ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "ACCEPTED")
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] border border-emerald-800 bg-emerald-950/30 text-emerald-400 px-1.5 py-0.5 rounded-sm">
        <CheckCircle2 className="w-2.5 h-2.5" />ACCEPTED
      </span>
    );
  if (status === "REJECTED")
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] border border-red-900 bg-red-950/20 text-red-400 px-1.5 py-0.5 rounded-sm">
        <XCircle className="w-2.5 h-2.5" />REJECTED
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] border border-zinc-700 text-zinc-500 px-1.5 py-0.5 rounded-sm">
      <Clock className="w-2.5 h-2.5" />PENDING
    </span>
  );
}

function SentRow({ p }: { p: ApplicationRow }) {
  return (
    <div className="flex items-start gap-3 px-3 py-3 border-b border-zinc-800 last:border-0">
      <Send className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-zinc-100">{p.job_title}</p>
        <p className="font-mono text-[10px] text-zinc-500 truncate mt-0.5">
          {p.listing_name ?? p.client_email ?? "Direct proposal"} · {fmtDate(p.submitted_at)}
        </p>
        <p className="font-mono text-[10px] text-zinc-600 mt-0.5">
          {p.proposed_budget} · {p.proposed_timeline}
        </p>
      </div>
      <StatusBadge status={p.status} />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ProposalsPage() {
  const { data: session } = useSession();
  const role     = (session?.user as { role?: string })?.role;
  const isClient = role === "client";

  const [received,         setReceived]         = useState<ReceivedProposal[]>([]);
  const [sent,             setSent]             = useState<ApplicationRow[]>([]);
  const [selected,         setSelected]         = useState<ReceivedProposal | null>(null);
  const [showLowQuality,   setShowLowQuality]   = useState(false);
  const [tierFilter,       setTierFilter]       = useState<"all" | "2" | "1" | "0">("all");
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    const url = isClient ? "/api/proposals/received" : "/api/freelancer/applications";
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: ReceivedProposal[] | ApplicationRow[]) => {
        if (isClient) setReceived(data as ReceivedProposal[]);
        else           setSent(data as ApplicationRow[]);
      })
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [session, isClient]);

  const handleAction = async (id: string, status: "ACCEPTED" | "REJECTED") => {
    const res = await fetch(`/api/proposals/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error("Failed to update proposal");
    setReceived(prev => prev.map(p => p.id === id ? { ...p, status } : p));
  };

  // ── Client view ───────────────────────────────────────────────────────────────

  if (isClient) {
    const scored  = received.map(p => ({ ...p, _s: computeScores(p) }));
    const sorted  = [...scored].sort((a, b) => b._s.overall_score - a._s.overall_score);
    const visible = sorted
      .filter(p => showLowQuality || !p._s.ai_generated_likely)
      .filter(p => tierFilter === "all" || p.identity_tier === Number(tierFilter));

    const topPicks    = visible.filter(p => p._s.top_pick).length;
    const lowQualCnt  = scored.filter(p => p._s.ai_generated_likely).length;

    return (
      <>
        <main className="flex-1 pb-20 lg:pb-0 max-w-2xl mx-auto w-full">
          {/* Header */}
          <div className="p-4 border-b border-zinc-800 flex items-start gap-3">
            <div className="flex-1">
              <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
                Proposals Received
              </h1>
              <p className="font-mono text-[10px] text-zinc-600 mt-0.5">
                {received.length} proposals · {topPicks} top picks
                {lowQualCnt > 0 ? ` · ${lowQualCnt} low quality` : ""}
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="px-4 py-2 border-b border-zinc-800 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              {(["all", "2", "1", "0"] as const).map(t => (
                <button key={t} onClick={() => setTierFilter(t)}
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
            {lowQualCnt > 0 && (
              <button onClick={() => setShowLowQuality(v => !v)}
                className={`ml-auto font-mono text-[10px] px-2 py-1 rounded-sm border transition-colors ${
                  showLowQuality
                    ? "border-red-900 bg-red-950/30 text-red-400"
                    : "border-zinc-800 text-zinc-600 hover:border-zinc-600"
                }`}
              >
                {showLowQuality ? "Hide low quality" : `Show ${lowQualCnt} low quality`}
              </button>
            )}
          </div>

          {loading  && <div>{[...Array(3)].map((_, i) => <SkeletonRow key={i} />)}</div>}
          {error    && <p className="p-4 font-mono text-xs text-red-500">{error}</p>}
          {!loading && !error && visible.length === 0 && (
            <p className="p-8 text-center font-mono text-xs text-zinc-600">
              No proposals received yet.
            </p>
          )}
          <div className="border-b border-zinc-800">
            {visible.map(p => (
              <ReceivedRow key={p.id} p={p} onSelect={setSelected} />
            ))}
          </div>

          {/* Legend */}
          <div className="p-4 grid grid-cols-2 gap-2">
            <div className="border border-green-900/40 rounded-sm p-2 bg-green-950/10">
              <div className="flex items-center gap-1.5 mb-1">
                <Star className="w-3 h-3 text-green-400" />
                <p className="font-mono text-[10px] text-green-400 uppercase tracking-widest">Top Pick</p>
              </div>
              <p className="font-mono text-[10px] text-zinc-500">Score ≥ 70 · Detailed cover · Specific deliverables</p>
            </div>
            <div className="border border-zinc-800 rounded-sm p-2 bg-zinc-900/20">
              <div className="flex items-center gap-1.5 mb-1">
                <Filter className="w-3 h-3 text-zinc-400" />
                <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest">Quality Score</p>
              </div>
              <p className="font-mono text-[10px] text-zinc-500">Cover depth · Technical detail · Specificity</p>
            </div>
          </div>
        </main>

        {selected && (
          <ReceivedDetailPanel
            p={selected}
            onClose={() => setSelected(null)}
            onAction={handleAction}
          />
        )}
      </>
    );
  }

  // ── Freelancer view ────────────────────────────────────────────────────────────

  const pending  = sent.filter(p => p.status === "PENDING").length;
  const accepted = sent.filter(p => p.status === "ACCEPTED").length;
  const rejected = sent.filter(p => p.status === "REJECTED").length;

  return (
    <main className="flex-1 pb-20 lg:pb-0 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 flex items-start gap-3">
        <div className="flex-1">
          <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
            My Proposals
          </h1>
          <p className="font-mono text-[10px] text-zinc-600 mt-0.5">
            Track proposals you&apos;ve submitted to clients
          </p>
        </div>
        <Link
          href="/proposals/draft"
          className="flex items-center gap-1.5 h-8 px-3 rounded-sm border border-amber-900
                     bg-amber-950 text-amber-400 font-mono text-[10px]
                     hover:border-amber-700 transition-colors whitespace-nowrap"
        >
          + Draft Proposal
        </Link>
      </div>

      {/* Summary stats */}
      {!loading && sent.length > 0 && (
        <div className="grid grid-cols-3 divide-x divide-zinc-800 border-b border-zinc-800">
          {[
            { label: "Pending",  value: pending,  color: "text-zinc-300"   },
            { label: "Accepted", value: accepted, color: "text-emerald-400" },
            { label: "Rejected", value: rejected, color: "text-zinc-600"   },
          ].map(({ label, value, color }) => (
            <div key={label} className="px-4 py-3 text-center">
              <p className={`font-mono text-2xl font-medium tabular-nums ${color}`}>{value}</p>
              <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {loading && <div>{[...Array(3)].map((_, i) => <SkeletonRow key={i} />)}</div>}
      {error   && <p className="p-4 font-mono text-xs text-red-500">{error}</p>}

      {!loading && !error && sent.length === 0 && (
        <div className="p-8 text-center space-y-3">
          <p className="font-mono text-xs text-zinc-600">No proposals submitted yet.</p>
          <Link
            href="/proposals/draft"
            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-sm border
                       border-amber-900 bg-amber-950 text-amber-400 font-mono text-xs
                       hover:border-amber-700 transition-colors"
          >
            Draft your first proposal
          </Link>
        </div>
      )}

      <div>
        {sent.map(p => <SentRow key={p.id} p={p} />)}
      </div>
    </main>
  );
}
