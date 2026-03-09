"use client";

import { Activity } from "lucide-react";

export interface BurnoutSignal {
  id:             string;
  risk_level:     "low" | "medium" | "high" | "critical";
  risk_score:     number;
  avg_stress_7d:  number | null;
  avg_mood_7d:    number | null;
  checkin_streak: number;
  computed_at:    string;
}

interface Props {
  signal: BurnoutSignal;
}

const LEVEL_CONFIG = {
  low:      { color: "text-emerald-400", bg: "bg-emerald-400", label: "Low Risk" },
  medium:   { color: "text-amber-400",   bg: "bg-amber-400",   label: "Medium Risk" },
  high:     { color: "text-orange-400",  bg: "bg-orange-400",  label: "High Risk" },
  critical: { color: "text-red-400",     bg: "bg-red-400",     label: "Critical" },
} as const;

export default function BurnoutMeter({ signal }: Props) {
  const cfg = LEVEL_CONFIG[signal.risk_level] ?? LEVEL_CONFIG.low;
  const barPct = Math.min(signal.risk_score, 100);

  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} className={cfg.color} />
          <span className="text-xs font-semibold text-zinc-200">Burnout Risk</span>
        </div>
        <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
      </div>

      {/* Score bar */}
      <div>
        <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
          <span>Score: {signal.risk_score}/100</span>
          <span>{signal.checkin_streak}-day streak</span>
        </div>
        <div className="h-2.5 w-full bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${cfg.bg}`}
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>

      {/* 7-day averages */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="bg-zinc-800/60 rounded-sm p-2">
          <div className="text-zinc-500 mb-0.5">Avg Stress 7d</div>
          <div className="font-semibold text-zinc-200">
            {signal.avg_stress_7d?.toFixed(1) ?? "—"} / 10
          </div>
        </div>
        <div className="bg-zinc-800/60 rounded-sm p-2">
          <div className="text-zinc-500 mb-0.5">Avg Mood 7d</div>
          <div className="font-semibold text-zinc-200">
            {signal.avg_mood_7d?.toFixed(1) ?? "—"} / 10
          </div>
        </div>
      </div>
    </div>
  );
}
