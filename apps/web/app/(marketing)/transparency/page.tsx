"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Eye,
  TrendingDown, ChevronRight, Info, AlertCircle,
  DollarSign, Briefcase, Star, Zap, BarChart2,
  CheckCircle, XCircle, ArrowUp, ArrowDown, Minus
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type GapDirection = "above" | "below" | "match";
type FactorStatus  = "pass" | "fail" | "partial";

interface MatchFactor {
  id:          string;
  category:    string;
  label:       string;
  yourValue:   string;
  required:    string;
  status:      FactorStatus;
  weight:      number;    // 0–100 weight in algorithm
  gap?:        string;    // human-readable gap description
  tip:         string;    // actionable tip
}

interface MissedJob {
  id:          string;
  title:       string;
  client:      string;
  budget:      string;
  postedAt:    string;
  yourScore:   number;    // 0–100 match score
  topScore:    number;    // winner's score
  factors:     MatchFactor[];
}

interface AlgorithmWeight {
  factor:  string;
  weight:  number;
  color:   string;
}

// ── Demo data ─────────────────────────────────────────────────────────────────
const ALGO_WEIGHTS: AlgorithmWeight[] = [
  { factor: "Trust Score",         weight: 25, color: "bg-amber-500"  },
  { factor: "Skill Match",         weight: 30, color: "bg-sky-500"    },
  { factor: "Rate Competitiveness",weight: 20, color: "bg-violet-500" },
  { factor: "Portfolio Evidence",  weight: 15, color: "bg-green-500"  },
  { factor: "Response Time",       weight: 5,  color: "bg-rose-500"   },
  { factor: "Repeat Hire Rate",    weight: 5,  color: "bg-zinc-500"   },
];


// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<FactorStatus, { icon: React.ElementType; color: string; bg: string }> = {
  pass:    { icon: CheckCircle, color: "text-green-400", bg: "bg-green-950/40" },
  fail:    { icon: XCircle,     color: "text-red-400",   bg: "bg-red-950/30"   },
  partial: { icon: AlertCircle, color: "text-amber-400", bg: "bg-amber-950/30" },
};

function ScoreBar({ yours, top }: { yours: number; top: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-zinc-600 w-16">You</span>
        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${yours}%` }} />
        </div>
        <span className="font-mono text-xs text-amber-400 w-8 text-right tabular-nums">{yours}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-zinc-600 w-16">Winner</span>
        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${top}%` }} />
        </div>
        <span className="font-mono text-xs text-green-400 w-8 text-right tabular-nums">{top}</span>
      </div>
    </div>
  );
}

function FactorRow({ f }: { f: MatchFactor }) {
  const [open, setOpen] = useState(f.status === "fail");
  const { icon: StatusIcon, color, bg } = STATUS_CONFIG[f.status];

  return (
    <div className={`border rounded-sm ${f.status === "fail" ? "border-red-900/60" : f.status === "partial" ? "border-amber-900/60" : "border-zinc-800"}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={(e) => e.key === "Enter" && setOpen(v => !v)}
        className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-zinc-900/40 transition-colors"
      >
        <StatusIcon className={`w-3.5 h-3.5 ${color} flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-zinc-600">{f.category}</span>
            <span className="font-mono text-xs text-zinc-200">{f.label}</span>
          </div>
          {f.gap && f.status !== "pass" && (
            <p className={`font-mono text-[11px] mt-0.5 ${color}`}>{f.gap}</p>
          )}
        </div>
        <div className="flex-shrink-0 text-right mr-2">
          <p className="font-mono text-[9px] text-zinc-600 uppercase">Your value</p>
          <p className="font-mono text-xs text-zinc-300">{f.yourValue}</p>
        </div>
        <div className="flex-shrink-0 text-right mr-2">
          <p className="font-mono text-[9px] text-zinc-600 uppercase">Required</p>
          <p className="font-mono text-xs text-zinc-400">{f.required}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="font-mono text-[9px] text-zinc-600 uppercase">Weight</p>
          <p className="font-mono text-xs text-zinc-400">{f.weight}%</p>
        </div>
        <ChevronRight className={`w-3.5 h-3.5 text-zinc-600 flex-shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
      </div>
      {open && (
        <div className={`border-t border-zinc-800 px-3 py-2.5 flex items-start gap-2 ${bg}`}>
          <Info className="w-3.5 h-3.5 text-sky-400 flex-shrink-0 mt-0.5" />
          <p className="font-mono text-xs text-zinc-400">{f.tip}</p>
        </div>
      )}
    </div>
  );
}

function MissedJobCard({ job }: { job: MissedJob }) {
  const [open, setOpen] = useState(false);
  const gap = job.topScore - job.yourScore;
  const failCount    = job.factors.filter(f => f.status === "fail").length;
  const partialCount = job.factors.filter(f => f.status === "partial").length;

  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900/40 overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={(e) => e.key === "Enter" && setOpen(v => !v)}
        className="flex items-start gap-3 px-3 py-3 cursor-pointer hover:bg-zinc-900/60 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-zinc-100">{job.title}</span>
            <span className="font-mono text-[10px] text-zinc-500 border border-zinc-800 px-1 py-0.5 rounded-sm">{job.budget}</span>
          </div>
          <p className="font-mono text-xs text-zinc-500 mt-0.5">{job.client} · Posted {job.postedAt}</p>
          <div className="flex items-center gap-3 mt-1.5">
            {failCount > 0 && (
              <span className="font-mono text-[10px] text-red-400 flex items-center gap-0.5">
                <XCircle className="w-2.5 h-2.5" /> {failCount} gap{failCount > 1 ? "s" : ""}
              </span>
            )}
            {partialCount > 0 && (
              <span className="font-mono text-[10px] text-amber-400 flex items-center gap-0.5">
                <AlertCircle className="w-2.5 h-2.5" /> {partialCount} partial
              </span>
            )}
            <span className="font-mono text-[10px] text-zinc-600">Score gap: −{gap} pts</span>
          </div>
        </div>
        <div className="flex-shrink-0 w-36">
          <ScoreBar yours={job.yourScore} top={job.topScore} />
        </div>
      </div>

      {open && (
        <div className="border-t border-zinc-800 px-3 py-3 space-y-2 bg-zinc-950/40">
          <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Factor Breakdown</p>
          {job.factors.map(f => <FactorRow key={f.id} f={f} />)}
        </div>
      )}
    </div>
  );
}

function MissedJobSkeleton() {
  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900/40 overflow-hidden animate-pulse">
      <div className="flex items-start gap-3 px-3 py-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 w-48 bg-zinc-800 rounded-sm" />
          <div className="h-3 w-32 bg-zinc-800 rounded-sm" />
          <div className="h-3 w-24 bg-zinc-800 rounded-sm" />
        </div>
        <div className="w-36 space-y-2">
          <div className="h-2 bg-zinc-800 rounded-full" />
          <div className="h-2 bg-zinc-800 rounded-full" />
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TransparencyPage() {
  const [tab, setTab] = useState<"missed" | "algorithm">("missed");
  const [jobs, setJobs] = useState<MissedJob[] | null>(null);
  const [err,  setErr]  = useState(false);

  useEffect(() => {
    fetch("/api/transparency/missed-jobs")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: MissedJob[]) => setJobs(data))
      .catch(() => setErr(true));
  }, []);

  const displayJobs = jobs ?? [];
  const totalGaps   = displayJobs.flatMap(j => j.factors).filter(f => f.status === "fail").length;
  const topGap      = displayJobs.flatMap(j => j.factors).find(f => f.status === "fail" && f.category === "Trust");

  return (
    <main className="min-w-0 px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Eye className="w-4 h-4 text-amber-400" />
              <h1 className="font-mono text-base font-medium text-zinc-100">Algorithmic Transparency</h1>
            </div>
            <p className="font-mono text-xs text-zinc-500">Exactly why you didn't get the job — no black boxes</p>
          </div>
        </div>

        {/* Promise callout */}
        <div className="border border-zinc-700 rounded-sm px-3 py-2.5 mb-5 flex items-start gap-2.5 bg-zinc-900/40">
          <Eye className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="font-mono text-xs text-zinc-400">
            <span className="text-zinc-200">No shadow banning. No mystery scores.</span>{" "}
            Every match decision on this platform is explainable. You see the exact factors, weights, and gaps — and how to fix each one.
          </p>
        </div>

        {/* Top action item */}
        {topGap && (
          <div className="border border-amber-900/50 bg-amber-950/20 rounded-sm px-3 py-2.5 mb-5 flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Zap className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-mono text-sm text-amber-300 font-medium">Highest-impact action</p>
                <p className="font-mono text-xs text-zinc-400 mt-0.5">
                  Your <span className="text-amber-300">Trust Score</span> is below threshold for {displayJobs.filter(j => j.factors.some(f => f.category === "Trust" && f.status === "fail")).length} missed jobs.
                  Completing biometric verification adds +40 pts and unlocks Tier 2.
                </p>
              </div>
            </div>
            <Link href="/dashboard" className="h-8 px-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-mono text-xs rounded-sm transition-colors flex items-center gap-1.5 flex-shrink-0">
              <Zap className="w-3 h-3" /> Verify Now
            </Link>
          </div>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {[
            { label: "Missed jobs (30d)", value: jobs === null ? "—" : displayJobs.length,         color: "text-zinc-100"  },
            { label: "Gaps identified",   value: jobs === null ? "—" : totalGaps,                  color: "text-red-400"   },
            { label: "Fixable this week", value: jobs === null ? "—" : Math.min(2, totalGaps),     color: "text-green-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="border border-zinc-800 rounded-sm p-2.5 text-center bg-zinc-900/40">
              <p className={`font-mono text-xl font-medium ${color}`}>{value}</p>
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800 mb-4">
          {[
            { key: "missed"    as const, label: jobs === null ? "Missed Jobs" : `Missed Jobs (${displayJobs.length})` },
            { key: "algorithm" as const, label: "How The Algorithm Works" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-2 font-mono text-xs border-b-2 transition-colors ${
                tab === key ? "border-amber-500 text-amber-400" : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >{label}</button>
          ))}
        </div>

        {/* Missed jobs */}
        {tab === "missed" && (
          <div
            className="space-y-3"
            aria-busy={jobs === null && !err}
            aria-label={jobs === null && !err ? "Loading missed jobs" : undefined}
          >
            {err ? (
              <div role="alert" className="border border-red-900/50 rounded-sm px-3 py-4 text-center">
                <p className="font-mono text-xs text-red-400">Failed to load match data. Please try refreshing.</p>
              </div>
            ) : jobs === null ? (
              <>
                <MissedJobSkeleton />
                <MissedJobSkeleton />
                <MissedJobSkeleton />
              </>
            ) : jobs.length === 0 ? (
              <div className="border border-zinc-800 rounded-sm px-3 py-8 text-center bg-zinc-900/40">
                <Eye className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
                <p className="font-mono text-sm text-zinc-400">No missed jobs yet</p>
                <p className="font-mono text-xs text-zinc-600 mt-1">
                  Match breakdowns appear here once the matching engine has ranked you for listings.
                </p>
              </div>
            ) : (
              jobs.map(job => <MissedJobCard key={job.id} job={job} />)
            )}
          </div>
        )}

        {/* Algorithm explainer */}
        {tab === "algorithm" && (
          <div className="space-y-4">
            {/* Weight chart */}
            <div className="border border-zinc-800 rounded-sm p-3 bg-zinc-900/40">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Match Score Weights</p>
              <div className="space-y-2">
                {ALGO_WEIGHTS.map(({ factor, weight, color }) => (
                  <div key={factor} className="flex items-center gap-3">
                    <span className="font-mono text-xs text-zinc-300 w-44 flex-shrink-0">{factor}</span>
                    <div className="flex-1 h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full`} style={{ width: `${weight}%` }} />
                    </div>
                    <span className="font-mono text-xs text-zinc-400 w-8 text-right tabular-nums">{weight}%</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-3">
                {ALGO_WEIGHTS.map(({ factor, color }) => (
                  <span key={factor} className="flex items-center gap-1 font-mono text-[10px] text-zinc-500">
                    <span className={`w-2 h-2 rounded-full ${color} flex-shrink-0`} />{factor}
                  </span>
                ))}
              </div>
            </div>

            {/* Factor explanations */}
            <div className="space-y-2">
              {[
                {
                  factor: "Skill Match (30%)",
                  icon: BarChart2,
                  how: "Jaccard similarity between your skill tags and the agent's required_skills list. Each tag must appear in your talent_skills table with proficiency ≥ 3 to count as a full match.",
                  improve: "Add skill tags with proficiency levels. Verified skills (from checklist deployments) score 1.5× unverified.",
                },
                {
                  factor: "Trust Score (25%)",
                  icon: Star,
                  how: "Computed from GitHub account age (30pts), LinkedIn verification (30pts), and biometric ZK proof (40pts). Clients set a minimum threshold; you only appear in results if you meet it.",
                  improve: "Complete biometric verification to reach Tier 2 and gain +40 pts. This unlocks 80%+ of premium listings.",
                },
                {
                  factor: "Rate Competitiveness (20%)",
                  icon: DollarSign,
                  how: "Your proposed rate vs. the top-3 competing bids for this role. Rates > 20% above median penalise match score. Fixed-price SOWs are compared on total project value.",
                  improve: "Use the Pricing Calculator to benchmark your rate. Consider offering milestone-based pricing instead of hourly.",
                },
                {
                  factor: "Portfolio Evidence (15%)",
                  icon: Briefcase,
                  how: "Count of verified deployments matching the client's industry vertical. On-chain verified deployments score 2×. Recency bonus: projects completed in last 90 days score 1.2×.",
                  improve: "Take smaller projects in target verticals to build verifiable evidence. On-chain verification is worth 2× regular listings.",
                },
                {
                  factor: "Response Time + Repeat (10%)",
                  icon: Zap,
                  how: "Average time to first message after match proposal (target < 2h). Repeat hire rate = clients who re-hired you / total clients. Low weight but can tip borderline matches.",
                  improve: "Enable notifications so you respond within 2h. A single repeat hire significantly boosts this score.",
                },
              ].map(({ factor, icon: Icon, how, improve }) => (
                <div key={factor} className="border border-zinc-800 rounded-sm p-3 bg-zinc-900/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-4 h-4 text-amber-400" />
                    <p className="font-mono text-sm text-zinc-200 font-medium">{factor}</p>
                  </div>
                  <p className="font-mono text-xs text-zinc-400 mb-2"><span className="text-zinc-300">How it&apos;s calculated:</span> {how}</p>
                  <div className="flex items-start gap-1.5">
                    <ArrowUp className="w-3 h-3 text-green-400 flex-shrink-0 mt-0.5" />
                    <p className="font-mono text-xs text-zinc-400"><span className="text-green-400">How to improve:</span> {improve}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* No shadow ban pledge */}
            <div className="border border-zinc-700 rounded-sm p-3 bg-zinc-900/40">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Platform Pledge</p>
              <div className="space-y-1.5">
                {[
                  "Your profile is never hidden from search without a reason shown in this dashboard",
                  "Algorithmic weights are published and cannot change without a 30-day notice period",
                  "You can request a human review of any match decision via the compliance team",
                  "Aggregate score distributions are published monthly so you can calibrate your position",
                ].map(text => (
                  <div key={text} className="flex items-start gap-2">
                    <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0 mt-0.5" />
                    <p className="font-mono text-xs text-zinc-400">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
  );
}
