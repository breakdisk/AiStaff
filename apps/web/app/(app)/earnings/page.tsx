"use client";

import { useEffect, useState } from "react";
import { DollarSign, TrendingUp, Clock, ChevronRight } from "lucide-react";
import type { BalanceResponse, BalanceRow } from "@/app/api/freelancer/balance/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function reasonLabel(reason: string): string {
  if (reason === "developer_70" || reason.includes("dev")) return "Dev share (70%)";
  if (reason === "talent_30"    || reason.includes("talent")) return "Talent share (30%)";
  return reason;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon,
}: { label: string; value: string; sub: string; icon: React.ReactNode }) {
  return (
    <div className="border border-zinc-800 rounded-sm p-4 bg-zinc-900/40 space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{label}</p>
        <span className="text-amber-400">{icon}</span>
      </div>
      <p className="font-mono text-2xl font-medium tabular-nums text-amber-400">{value}</p>
      <p className="font-mono text-[9px] text-zinc-600">{sub}</p>
    </div>
  );
}

function PayoutRow({ row }: { row: BalanceRow }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-zinc-800/60 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-zinc-300">{reasonLabel(row.reason)}</p>
        <p className="font-mono text-[10px] text-zinc-600 truncate">
          {row.deployment_id}
        </p>
      </div>
      <div className="text-right flex-shrink-0 space-y-0.5">
        <p className="font-mono text-sm text-emerald-400 tabular-nums">{usd(row.amount_cents)}</p>
        <p className="font-mono text-[9px] text-zinc-600">{fmtDate(row.created_at)}</p>
      </div>
      <ChevronRight size={12} className="text-zinc-700 flex-shrink-0" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EarningsPage() {
  const [data,    setData]    = useState<BalanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    fetch("/api/freelancer/balance")
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<BalanceResponse>;
      })
      .then(setData)
      .catch(e => setError(e.message ?? "Failed to load earnings"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center gap-2">
          <DollarSign className="text-amber-400" size={16} />
          <h1 className="text-base font-semibold">Earnings</h1>
          <span className="ml-auto font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
            Escrow ledger
          </span>
        </div>

        {/* Notice banner */}
        <div className="border border-amber-900/60 bg-amber-950/20 rounded-sm px-4 py-3">
          <p className="font-mono text-[11px] text-amber-400/80">
            Funds accumulate in escrow and are disbursed manually at settlement.
            Contact support to initiate a bank transfer once your balance is available.
          </p>
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="border border-red-900 bg-red-950/30 rounded-sm px-4 py-3 font-mono text-xs text-red-400">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Total Earned"
                value={usd(data.total_earned_cents)}
                sub="All-time escrow releases"
                icon={<TrendingUp size={14} />}
              />
              <StatCard
                label="Last 30 Days"
                value={usd(data.last_30d_cents)}
                sub="Rolling 30-day window"
                icon={<Clock size={14} />}
              />
            </div>

            {/* Payout history */}
            <div className="border border-zinc-800 rounded-sm bg-zinc-900/40 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                  Payout History
                </p>
              </div>

              {data.rows.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="font-mono text-xs text-zinc-600">No payouts yet</p>
                </div>
              ) : (
                data.rows.map(row => <PayoutRow key={row.id} row={row} />)
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
