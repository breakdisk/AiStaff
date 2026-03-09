"use client";

import { Award, AlertTriangle, ExternalLink } from "lucide-react";
import { useState } from "react";

interface ReputationBadgeProps {
  talentId:          string;
  reputationScore:   number;  // 0–100
  totalDeployments:  number;
  totalEarnedCents:  number;
  driftIncidents:    number;
  vcIssued:          boolean;
  onExportVc?:       () => Promise<void>;
}

function scoreColor(s: number) {
  if (s >= 80) return "text-green-400";
  if (s >= 60) return "text-amber-400";
  if (s >= 40) return "text-zinc-300";
  return "text-zinc-500";
}

function barColor(s: number) {
  if (s >= 80) return "bg-green-500";
  if (s >= 60) return "bg-amber-500";
  if (s >= 40) return "bg-zinc-500";
  return "bg-zinc-700";
}

export default function ReputationBadge({
  reputationScore,
  totalDeployments,
  totalEarnedCents,
  driftIncidents,
  vcIssued,
  onExportVc,
}: ReputationBadgeProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!onExportVc || exporting) return;
    setExporting(true);
    try { await onExportVc(); } finally { setExporting(false); }
  };

  const fmtUSD = (cents: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency", currency: "USD", maximumFractionDigits: 0,
    }).format(cents / 100);

  return (
    <div className="border border-zinc-800 bg-zinc-950 p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Award size={14} className={scoreColor(reputationScore)} />
        <span className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">
          Reputation
        </span>
        {vcIssued && (
          <span className="ml-auto font-mono text-[10px] px-1 border border-green-800 text-green-400">
            W3C VC
          </span>
        )}
      </div>

      {/* Score + progress bar */}
      <div className="mb-3">
        <div className="flex items-end justify-between mb-1">
          <span className={`font-mono text-3xl font-medium tabular-nums ${scoreColor(reputationScore)}`}>
            {reputationScore.toFixed(1)}
          </span>
          <span className="font-mono text-xs text-zinc-600">/100</span>
        </div>
        <div className="h-0.5 bg-zinc-800">
          <div
            className={`h-full ${barColor(reputationScore)} transition-all duration-500`}
            style={{ width: `${reputationScore}%` }}
          />
        </div>
      </div>

      {/* ROI stats — 3-column */}
      <div className="grid grid-cols-3 gap-x-3 text-xs mb-3">
        <span className="text-zinc-500">Deploys</span>
        <span className="text-zinc-500">Earned</span>
        <span className="text-zinc-500">Drift</span>
        <span className="font-mono text-zinc-200 tabular-nums">
          {totalDeployments}
        </span>
        <span className="font-mono text-zinc-200 tabular-nums">
          {fmtUSD(totalEarnedCents)}
        </span>
        <span className={`font-mono tabular-nums flex items-center gap-0.5 ${driftIncidents > 0 ? "text-red-400" : "text-zinc-200"}`}>
          {driftIncidents > 0 && <AlertTriangle size={9} className="shrink-0" />}
          {driftIncidents}
        </span>
      </div>

      {/* Export W3C VC */}
      <button
        onClick={handleExport}
        disabled={exporting}
        className="flex items-center justify-center gap-1.5 w-full h-8
                   border border-zinc-700 text-zinc-400 font-mono text-xs uppercase
                   tracking-widest hover:border-zinc-500 hover:text-zinc-300
                   active:scale-[0.98] transition-all disabled:opacity-40"
      >
        <ExternalLink size={11} />
        {exporting ? "Exporting…" : "Export W3C VC"}
      </button>
    </div>
  );
}
