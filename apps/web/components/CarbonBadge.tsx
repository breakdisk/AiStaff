"use client";

import { Leaf } from "lucide-react";

export interface CarbonFootprint {
  id:               string;
  total_kg_offset:  number;
  total_kg_emitted: number;
  net_kg:           number;
  updated_at:       string;
}

interface Props {
  footprint: CarbonFootprint | null;
  compact?:  boolean;
}

export default function CarbonBadge({ footprint, compact = false }: Props) {
  if (!footprint) {
    return (
      <div className={`flex items-center gap-1.5 ${compact ? "" : "rounded-sm border border-zinc-800 bg-zinc-900 p-3"}`}>
        <Leaf size={12} className="text-zinc-600" />
        <span className="text-[11px] text-zinc-500">No carbon data</span>
      </div>
    );
  }

  const isPositive = footprint.net_kg <= 0; // net negative = good (offset > emitted)

  if (compact) {
    return (
      <div className="flex items-center gap-1.5" title={`Net: ${footprint.net_kg.toFixed(1)} kg CO₂e`}>
        <Leaf size={12} className={isPositive ? "text-emerald-400" : "text-amber-400"} />
        <span className={`text-[11px] font-medium ${isPositive ? "text-emerald-400" : "text-amber-400"}`}>
          {footprint.total_kg_offset.toFixed(0)} kg offset
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Leaf size={14} className={isPositive ? "text-emerald-400" : "text-amber-400"} />
        <span className="text-xs font-semibold text-zinc-200">Carbon Footprint</span>
        {isPositive && (
          <span className="ml-auto text-[10px] bg-emerald-400/10 text-emerald-400 px-1.5 py-0.5 rounded-sm">
            Carbon Positive
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
        <div className="bg-zinc-800/60 rounded-sm p-2">
          <div className="text-zinc-500 mb-0.5">Offset</div>
          <div className="font-semibold text-emerald-400">
            {footprint.total_kg_offset.toFixed(1)} kg
          </div>
        </div>
        <div className="bg-zinc-800/60 rounded-sm p-2">
          <div className="text-zinc-500 mb-0.5">Emitted</div>
          <div className="font-semibold text-zinc-300">
            {footprint.total_kg_emitted.toFixed(1)} kg
          </div>
        </div>
        <div className="bg-zinc-800/60 rounded-sm p-2">
          <div className="text-zinc-500 mb-0.5">Net</div>
          <div className={`font-semibold ${isPositive ? "text-emerald-400" : "text-amber-400"}`}>
            {footprint.net_kg.toFixed(1)} kg
          </div>
        </div>
      </div>
    </div>
  );
}
