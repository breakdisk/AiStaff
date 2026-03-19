"use client";

import { useState } from "react";
import Link from "next/link";
import { DollarSign, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { AppSidebar, AppMobileNav } from "@/components/AppSidebar";

// ── Demo data ───────────────────────────────────────────────────────────────

interface SkillPriceData {
  skill:           string;
  category:        string;
  market_low:      number;   // cents/hr
  market_median:   number;
  market_high:     number;
  ai_suggested:    number;   // AI-recommended rate for this context
  demand:          "high" | "medium" | "low";
  trend:           "up" | "stable" | "down";
  trend_pct:       number;   // % change over 30 days
  active_jobs:     number;
  active_talent:   number;
}

const SKILL_DATA: SkillPriceData[] = [
  {
    skill: "Rust / Wasm Engineer",    category: "Systems",
    market_low: 12000, market_median: 17500, market_high: 25000,
    ai_suggested: 18500,
    demand: "high", trend: "up", trend_pct: 12,
    active_jobs: 43, active_talent: 18,
  },
  {
    skill: "ML Systems Architect",    category: "AI/ML",
    market_low: 15000, market_median: 21000, market_high: 30000,
    ai_suggested: 22000,
    demand: "high", trend: "up", trend_pct: 18,
    active_jobs: 61, active_talent: 22,
  },
  {
    skill: "DevOps + Kubernetes",     category: "Infra",
    market_low: 8500,  market_median: 13000, market_high: 19000,
    ai_suggested: 13500,
    demand: "medium", trend: "stable", trend_pct: 2,
    active_jobs: 29, active_talent: 41,
  },
  {
    skill: "Kafka / Event Streaming", category: "Backend",
    market_low: 9000,  market_median: 14000, market_high: 20000,
    ai_suggested: 14500,
    demand: "medium", trend: "up", trend_pct: 6,
    active_jobs: 22, active_talent: 19,
  },
  {
    skill: "TypeScript / Next.js",    category: "Frontend",
    market_low: 7000,  market_median: 11000, market_high: 16000,
    ai_suggested: 11000,
    demand: "low", trend: "down", trend_pct: -4,
    active_jobs: 18, active_talent: 67,
  },
  {
    skill: "ZK / Cryptography",       category: "Security",
    market_low: 18000, market_median: 27000, market_high: 40000,
    ai_suggested: 28000,
    demand: "high", trend: "up", trend_pct: 31,
    active_jobs: 11, active_talent: 4,
  },
  {
    skill: "Robotics / ROS2",         category: "Robotics",
    market_low: 14000, market_median: 20000, market_high: 28000,
    ai_suggested: 21500,
    demand: "high", trend: "up", trend_pct: 22,
    active_jobs: 19, active_talent: 7,
  },
];


// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtRate(c: number) { return `$${(c / 100).toFixed(0)}/hr`; }

function DemandBadge({ demand }: { demand: SkillPriceData["demand"] }) {
  const map = {
    high:   "border-green-800 text-green-400 bg-green-950/30",
    medium: "border-amber-800 text-amber-400 bg-amber-950/30",
    low:    "border-zinc-700  text-zinc-500  bg-zinc-900/30",
  };
  return (
    <span className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border rounded-sm ${map[demand]}`}>
      {demand} demand
    </span>
  );
}

function TrendChip({ trend, pct }: { trend: SkillPriceData["trend"]; pct: number }) {
  if (trend === "up")     return <span className="flex items-center gap-0.5 font-mono text-[10px] text-green-400"><TrendingUp className="w-3 h-3" />+{pct}%</span>;
  if (trend === "down")   return <span className="flex items-center gap-0.5 font-mono text-[10px] text-red-400"><TrendingDown className="w-3 h-3" />{pct}%</span>;
  return <span className="flex items-center gap-0.5 font-mono text-[10px] text-zinc-500"><Minus className="w-3 h-3" />stable</span>;
}

// ── RangeBar ─────────────────────────────────────────────────────────────────

function RangeBar({
  low, median, high, suggested, userRate,
}: { low: number; median: number; high: number; suggested: number; userRate: number | null }) {
  const span = high - low;
  const pct  = (v: number) => Math.max(0, Math.min(100, ((v - low) / span) * 100));

  return (
    <div className="relative mt-3 mb-5">
      {/* Track */}
      <div className="h-2 w-full rounded-full bg-zinc-800 relative">
        {/* Filled segment: low→high */}
        <div className="absolute inset-0 rounded-full bg-zinc-700" />
        {/* AI suggestion marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-amber-400 border-2 border-zinc-950 z-20"
          style={{ left: `${pct(suggested)}%`, marginLeft: "-6px" }}
          title={`AI suggested: ${fmtRate(suggested)}`}
        />
        {/* User rate marker */}
        {userRate !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-sky-400 border-2 border-zinc-950 z-20"
            style={{ left: `${pct(userRate)}%`, marginLeft: "-6px" }}
            title={`Your rate: ${fmtRate(userRate)}`}
          />
        )}
        {/* Median tick */}
        <div
          className="absolute top-0 bottom-0 w-px bg-zinc-500 z-10"
          style={{ left: `${pct(median)}%` }}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between mt-1.5">
        <span className="font-mono text-[9px] text-zinc-600">{fmtRate(low)}</span>
        <span className="font-mono text-[9px] text-zinc-500">median {fmtRate(median)}</span>
        <span className="font-mono text-[9px] text-zinc-600">{fmtRate(high)}</span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2">
        <span className="flex items-center gap-1 font-mono text-[9px] text-amber-400">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> AI suggested
        </span>
        {userRate !== null && (
          <span className="flex items-center gap-1 font-mono text-[9px] text-sky-400">
            <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" /> Your rate
          </span>
        )}
        <span className="flex items-center gap-1 font-mono text-[9px] text-zinc-500">
          <span className="w-px h-3 bg-zinc-500 inline-block" /> median
        </span>
      </div>
    </div>
  );
}

// ── PriceCard ─────────────────────────────────────────────────────────────────

function PriceCard({ data }: { data: SkillPriceData }) {
  const [open,     setOpen]     = useState(false);
  const [userRate, setUserRate] = useState<number | null>(null);
  const [inputVal, setInputVal] = useState("");

  const supplyDemandRatio = data.active_jobs / Math.max(1, data.active_talent);
  const percentile = Math.round(((data.ai_suggested - data.market_low) / (data.market_high - data.market_low)) * 100);

  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-zinc-900 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-mono text-xs font-medium text-zinc-100">{data.skill}</p>
            <span className="font-mono text-[9px] text-zinc-600 border border-zinc-800 px-1.5 py-0.5 rounded-sm">{data.category}</span>
            <DemandBadge demand={data.demand} />
          </div>
          <div className="flex items-center gap-3 mt-1">
            <TrendChip trend={data.trend} pct={data.trend_pct} />
            <span className="font-mono text-[9px] text-zinc-600">{data.active_jobs} open jobs · {data.active_talent} talent</span>
          </div>
        </div>

        <div className="flex-shrink-0 text-right">
          <p className="font-mono text-[10px] text-zinc-600 uppercase">AI Rate</p>
          <p className="font-mono text-sm font-medium text-amber-400 tabular-nums">{fmtRate(data.ai_suggested)}</p>
        </div>

        {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />}
      </button>

      {/* Expanded */}
      {open && (
        <div className="border-t border-zinc-800 bg-zinc-950/50 px-4 py-3 space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="border border-zinc-800 rounded-sm p-2">
              <p className="font-mono text-[9px] text-zinc-600 uppercase">Supply/Demand</p>
              <p className={`font-mono text-sm font-medium tabular-nums mt-0.5 ${
                supplyDemandRatio > 1.5 ? "text-green-400" : supplyDemandRatio < 0.7 ? "text-red-400" : "text-amber-400"
              }`}>{supplyDemandRatio.toFixed(1)}×</p>
              <p className="font-mono text-[9px] text-zinc-600">jobs per talent</p>
            </div>
            <div className="border border-zinc-800 rounded-sm p-2">
              <p className="font-mono text-[9px] text-zinc-600 uppercase">AI Percentile</p>
              <p className="font-mono text-sm font-medium tabular-nums mt-0.5 text-zinc-300">{percentile}th</p>
              <p className="font-mono text-[9px] text-zinc-600">of market range</p>
            </div>
            <div className="border border-zinc-800 rounded-sm p-2">
              <p className="font-mono text-[9px] text-zinc-600 uppercase">30d Trend</p>
              <TrendChip trend={data.trend} pct={data.trend_pct} />
              <p className="font-mono text-[9px] text-zinc-600 mt-0.5">vs last month</p>
            </div>
          </div>

          {/* Range bar */}
          <div>
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-0.5">Market Rate Range</p>
            <RangeBar
              low={data.market_low}
              median={data.market_median}
              high={data.market_high}
              suggested={data.ai_suggested}
              userRate={userRate}
            />
          </div>

          {/* Rate input */}
          <div className="flex items-center gap-2">
            <p className="font-mono text-[10px] text-zinc-500 flex-shrink-0">Your rate ($/hr):</p>
            <input
              type="number"
              min="0"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="e.g. 185"
              className="flex-1 min-w-0 h-8 px-2 bg-zinc-900 border border-zinc-800 rounded-sm
                         font-mono text-xs text-zinc-100 placeholder:text-zinc-600
                         focus:outline-none focus:border-zinc-600"
            />
            <button
              onClick={() => {
                const v = parseFloat(inputVal);
                if (!isNaN(v) && v > 0) setUserRate(Math.round(v * 100));
              }}
              className="h-8 px-3 rounded-sm border border-amber-900 bg-amber-950 text-amber-400
                         font-mono text-[10px] uppercase tracking-widest hover:border-amber-700 transition-colors"
            >
              Compare
            </button>
          </div>

          {/* AI recommendation callout */}
          <div className="border border-amber-900/40 bg-amber-950/10 rounded-sm p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="w-3 h-3 text-amber-400" />
              <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest">AI Recommendation</p>
            </div>
            <p className="font-mono text-xs text-zinc-400 leading-relaxed">
              Based on {data.active_jobs} open jobs and {data.active_talent} available specialists, the optimal rate
              for <span className="text-zinc-200">{data.skill}</span> is{" "}
              <span className="text-amber-400 font-medium">{fmtRate(data.ai_suggested)}</span>.{" "}
              {data.demand === "high"
                ? "High demand allows premium pricing — you can negotiate above median."
                : data.demand === "low"
                ? "Supply exceeds demand; competitive pricing improves close rate."
                : "Market is balanced — median rate maximises volume."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PricingToolPage() {
  const [filterCategory, setFilterCategory] = useState<string>("All");
  const categories = ["All", ...Array.from(new Set(SKILL_DATA.map((s) => s.category)))];

  const filtered = filterCategory === "All"
    ? SKILL_DATA
    : SKILL_DATA.filter((s) => s.category === filterCategory);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <AppSidebar />

      {/* Main */}
      <main className="flex-1 p-4 pb-20 lg:pb-4 max-w-3xl mx-auto w-full space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
              Dynamic Pricing Tool
            </h1>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">
              AI-driven rate benchmarks from live marketplace data
            </p>
          </div>
          <DollarSign className="w-5 h-5 text-amber-500" />
        </div>

        {/* Explanation */}
        <div className="border border-amber-900/40 bg-amber-950/10 rounded-sm p-3">
          <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-1">How this works</p>
          <p className="font-mono text-xs text-zinc-400 leading-relaxed">
            Rates are computed from closed engagements on the platform, weighted by jurisdiction,
            recency, and identity tier. The AI recommendation targets the 60th percentile for high-demand
            skills and 40th percentile for saturated categories.
          </p>
        </div>

        {/* Category filter */}
        <div className="flex gap-1.5 flex-wrap">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setFilterCategory(c)}
              className={`px-2.5 py-1 rounded-sm font-mono text-[10px] uppercase tracking-widest border transition-colors ${
                filterCategory === c
                  ? "border-amber-800 text-amber-400 bg-amber-950/30"
                  : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
              }`}
            >{c}</button>
          ))}
        </div>

        {/* Cards */}
        <div className="space-y-2">
          {filtered.map((s) => (
            <PriceCard key={s.skill} data={s} />
          ))}
        </div>
      </main>

      <AppMobileNav />
    </div>
  );
}
