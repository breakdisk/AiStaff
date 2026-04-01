"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { TrendingUp, Link as LinkIcon, ArrowRight } from "lucide-react";

type Category = "AiTalent" | "AiStaff" | "AiRobot";
type Duration = 1 | 3 | 6 | 12;

function RoiCalculatorInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [category, setCategory]         = useState<Category>("AiStaff");
  const [hoursPerWeek, setHoursPerWeek] = useState<number>(10);
  const [hourlyRate, setHourlyRate]     = useState<number>(75);
  const [duration, setDuration]         = useState<Duration>(3);
  const [copied, setCopied]             = useState(false);

  // Hydrate from URL on mount
  useEffect(() => {
    const cat = searchParams.get("cat");
    const h   = searchParams.get("h");
    const r   = searchParams.get("rate");
    const d   = searchParams.get("dur");

    if (cat === "AiTalent" || cat === "AiStaff" || cat === "AiRobot") setCategory(cat);
    if (h)    setHoursPerWeek(Math.min(40, Math.max(1, Number(h))));
    if (r)    setHourlyRate(Math.max(1, Number(r)));
    if (d)    setDuration([1, 3, 6, 12].includes(Number(d)) ? (Number(d) as Duration) : 3);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams({
      cat:  category,
      h:    String(hoursPerWeek),
      rate: String(hourlyRate),
      dur:  String(duration),
    });
    router.replace(`/tools/roi-calculator?${params.toString()}`, { scroll: false });
  }, [category, hoursPerWeek, hourlyRate, duration, router]);

  // Derived values
  const weeks            = duration * 4.33;
  const humanCost        = hoursPerWeek * hourlyRate * weeks;
  const agentCostEstimate = humanCost * 0.15;
  const roi              = humanCost > 0 ? ((humanCost - agentCostEstimate) / humanCost) * 100 : 0;
  const breakEvenWeek    = agentCostEstimate > 0
    ? Math.ceil(agentCostEstimate / (hourlyRate * hoursPerWeek))
    : 0;

  function fmt(n: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  }

  async function handleShare() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-mono">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-sm bg-amber-400/10 border border-amber-400/30 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-mono text-zinc-50">AI ROI Calculator</h1>
            <p className="text-xs text-zinc-400">Compare human cost vs AI agent deployment cost</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Inputs ─────────────────────────────────────────────────────── */}
          <div className="space-y-5">
            <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-5 space-y-5">

              {/* Category */}
              <div>
                <label className="block text-xs text-zinc-400 mb-2">Agent Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-3 py-2 text-sm text-zinc-50 focus:outline-none focus:border-amber-400"
                >
                  <option value="AiTalent">AiTalent — Remote AI Specialists</option>
                  <option value="AiStaff">AiStaff — Enterprise AI Agents</option>
                  <option value="AiRobot">AiRobot — AI Robotics Rental</option>
                </select>
              </div>

              {/* Hours per week */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-zinc-400">Hours per Week</label>
                  <span className="text-xs text-amber-400">{hoursPerWeek}h</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={40}
                  step={1}
                  value={hoursPerWeek}
                  onChange={(e) => setHoursPerWeek(Number(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
                <div className="flex justify-between text-xs text-zinc-600 mt-1">
                  <span>1h</span>
                  <span>40h</span>
                </div>
              </div>

              {/* Hourly rate */}
              <div>
                <label className="block text-xs text-zinc-400 mb-2">Human Hourly Rate</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">$</span>
                  <input
                    type="number"
                    min={1}
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-sm pl-7 pr-3 py-2 text-sm text-zinc-50 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="block text-xs text-zinc-400 mb-2">Deployment Duration</label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value) as Duration)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-3 py-2 text-sm text-zinc-50 focus:outline-none focus:border-amber-400"
                >
                  <option value={1}>1 month</option>
                  <option value={3}>3 months</option>
                  <option value={6}>6 months</option>
                  <option value={12}>12 months</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Results ────────────────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Stat tiles */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4">
                <p className="text-xs text-zinc-400 mb-1">Human Cost</p>
                <p className="text-lg text-zinc-50">{fmt(humanCost)}</p>
                <p className="text-xs text-zinc-600">{duration}mo at {fmt(hourlyRate)}/hr</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4">
                <p className="text-xs text-zinc-400 mb-1">Agent Cost <span className="text-zinc-600">(est.)</span></p>
                <p className="text-lg text-amber-400">{fmt(agentCostEstimate)}</p>
                <p className="text-xs text-zinc-600">15% platform estimate</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4">
                <p className="text-xs text-zinc-400 mb-1">ROI</p>
                <p className="text-lg text-emerald-400">{roi.toFixed(1)}%</p>
                <p className="text-xs text-zinc-600">cost reduction</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4">
                <p className="text-xs text-zinc-400 mb-1">Break-even</p>
                <p className="text-lg text-zinc-50">
                  {breakEvenWeek > 0 ? `Week ${breakEvenWeek}` : "—"}
                </p>
                <p className="text-xs text-zinc-600">from deployment</p>
              </div>
            </div>

            {/* ROI bar */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-zinc-400">ROI Progress</p>
                <p className="text-xs text-emerald-400">{roi.toFixed(1)}%</p>
              </div>
              <div className="h-2 bg-zinc-800 rounded-sm overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, roi)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-zinc-600 mt-1">
                <span>0%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Disclaimer */}
            <p className="text-xs text-zinc-500 leading-relaxed border border-zinc-800 rounded-sm p-3 bg-zinc-900">
              Agent cost is a platform fee estimate (15% commission). Actual costs vary by agent
              type, deployment hours, and marketplace tier. Escrow-backed payments only.
            </p>

            {/* Actions */}
            <div className="flex gap-3">
              <Link
                href="/marketplace"
                className="flex-1 flex items-center justify-center gap-2 h-10 bg-amber-400 text-zinc-950 text-sm font-mono rounded-sm hover:bg-amber-300 transition-colors"
              >
                Deploy an Agent
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={handleShare}
                className="flex items-center gap-2 h-10 px-4 border border-zinc-800 rounded-sm text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
              >
                <LinkIcon className="w-3.5 h-3.5" />
                {copied ? "Copied!" : "Share Result"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RoiCalculatorClient() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="h-8 w-48 bg-zinc-800 rounded-sm animate-pulse" />
      </div>
    }>
      <RoiCalculatorInner />
    </Suspense>
  );
}
