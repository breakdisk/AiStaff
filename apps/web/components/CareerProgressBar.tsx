"use client";

import { Zap } from "lucide-react";

interface Props {
  totalXp:        number;
  milestoneCount: number;
  currentTier:    number;
  targetRole?:    string;
}

// XP thresholds for tier labels
const TIER_LABELS = ["Unverified", "Social Verified", "Biometric Verified"] as const;

export default function CareerProgressBar({ totalXp, milestoneCount, currentTier, targetRole }: Props) {
  // Visual XP bar: scale up to 5000 XP
  const barPct = Math.min((totalXp / 5000) * 100, 100);

  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-amber-400" />
          <span className="text-xs font-semibold text-zinc-200">Career Progress</span>
        </div>
        <span className="text-[11px] text-zinc-400">
          Tier {currentTier} — {TIER_LABELS[currentTier] ?? "Unknown"}
        </span>
      </div>

      {/* XP bar */}
      <div>
        <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
          <span>{totalXp.toLocaleString()} XP</span>
          <span>5,000 XP</span>
        </div>
        <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all duration-500"
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-[11px] text-zinc-400">
        <span>
          <strong className="text-zinc-200">{milestoneCount}</strong> milestone{milestoneCount !== 1 ? "s" : ""}
        </span>
        {targetRole && (
          <span>
            Target: <strong className="text-zinc-200">{targetRole}</strong>
          </span>
        )}
      </div>
    </div>
  );
}
