"use client";

import { useState, useEffect } from "react";
import { fetchTalentPayouts, type TalentPayout } from "@/lib/api";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatAmount(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export default function TalentEarningsWidget() {
  const [payouts, setPayouts] = useState<TalentPayout[] | null>(null);

  useEffect(() => {
    fetchTalentPayouts()
      .then(setPayouts)
      .catch(() => setPayouts([]));
  }, []);

  if (payouts === null) {
    return (
      <div className="border border-zinc-800 rounded-sm overflow-hidden space-y-px p-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-8 bg-zinc-800 animate-pulse rounded-sm" />
        ))}
      </div>
    );
  }

  if (payouts.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-sm px-3 py-4 text-center">
        <p className="font-mono text-[10px] text-zinc-500">
          No payouts yet — complete your first engagement
        </p>
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 rounded-sm overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-4 gap-2 px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/50">
        {["Date", "Project", "Amount", "Status"].map(h => (
          <span key={h} className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">
            {h}
          </span>
        ))}
      </div>
      {/* Data rows */}
      <div className="divide-y divide-zinc-800/50">
        {payouts.map(p => (
          <div key={p.id} className="grid grid-cols-4 gap-2 px-3 py-2 items-center">
            <span className="font-mono text-[10px] text-zinc-400">{formatDate(p.released_at)}</span>
            <span className="font-mono text-[10px] text-zinc-400 truncate">{p.agent_name}</span>
            <span className="font-mono text-[10px] text-emerald-400">{formatAmount(p.amount_cents)}</span>
            <span className="font-mono text-[10px] text-emerald-400">Released</span>
          </div>
        ))}
      </div>
    </div>
  );
}
