"use client";

import { useEffect, useState } from "react";
import { DollarSign, TrendingUp, Clock, ChevronRight, Download, CheckCircle2, Send } from "lucide-react";
import type { BalanceResponse, BalanceRow } from "@/app/api/freelancer/balance/route";
import type { MonthlyEarningsResponse } from "@/app/api/freelancer/earnings/monthly/route";
import type { PayoutRequest } from "@/app/api/freelancer/payout-request/route";

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

// ── Monthly bar chart (pure SVG/CSS — no extra deps) ─────────────────────────

function MonthlyChart({ data }: { data: { month: string; earned_cents: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="h-28 flex items-center justify-center">
        <p className="font-mono text-[10px] text-zinc-700">No earnings in last 6 months</p>
      </div>
    );
  }

  const max = Math.max(...data.map(d => d.earned_cents), 1);

  return (
    <div className="flex items-end gap-1.5 h-24 pt-2">
      {data.map(d => {
        const heightPct = Math.max((d.earned_cents / max) * 100, d.earned_cents > 0 ? 4 : 0);
        const label     = d.month.slice(5); // MM only
        return (
          <div key={d.month} className="flex-1 flex flex-col items-center gap-1 group">
            <div className="relative w-full flex flex-col justify-end" style={{ height: "72px" }}>
              {d.earned_cents > 0 && (
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-sm bg-amber-400/70
                             group-hover:bg-amber-400 transition-colors"
                  style={{ height: `${heightPct}%` }}
                />
              )}
            </div>
            <p className="font-mono text-[9px] text-zinc-600">{label}</p>
          </div>
        );
      })}
    </div>
  );
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
        <p className="font-mono text-[10px] text-zinc-600 truncate">{row.deployment_id}</p>
      </div>
      <div className="text-right flex-shrink-0 space-y-0.5">
        <p className="font-mono text-sm text-emerald-400 tabular-nums">{usd(row.amount_cents)}</p>
        <p className="font-mono text-[9px] text-zinc-600">{fmtDate(row.created_at)}</p>
      </div>
      <a
        href={`/api/freelancer/invoice/${row.id}`}
        download
        onClick={e => e.stopPropagation()}
        title="Download invoice"
        className="text-zinc-700 hover:text-amber-400 transition-colors flex-shrink-0"
      >
        <Download size={12} />
      </a>
    </div>
  );
}

// ── Payout request form ───────────────────────────────────────────────────────

function PayoutStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING:    "border-zinc-700 text-zinc-500",
    PROCESSING: "border-amber-800 text-amber-400",
    PAID:       "border-emerald-800 text-emerald-400",
    REJECTED:   "border-red-900 text-red-400",
  };
  return (
    <span className={`font-mono text-[10px] border px-1.5 py-0.5 rounded-sm ${map[status] ?? map.PENDING}`}>
      {status}
    </span>
  );
}

function PayoutRequestSection({ totalBalance }: { totalBalance: number }) {
  const [requests,   setRequests]   = useState<PayoutRequest[]>([]);
  const [loadingReq, setLoadingReq] = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [amount,     setAmount]     = useState("");
  const [bankRef,    setBankRef]    = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done,       setDone]       = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/freelancer/payout-request")
      .then(r => r.ok ? r.json() : [])
      .then(setRequests)
      .finally(() => setLoadingReq(false));
  }, []);

  const hasPending = requests.some(r => r.status === "PENDING");

  const submit = async () => {
    const cents = Math.round(parseFloat(amount) * 100);
    if (!cents || cents <= 0) { setError("Enter a valid amount."); return; }
    if (cents > totalBalance)  { setError(`Maximum available: ${usd(totalBalance)}`); return; }
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/freelancer/payout-request", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ amount_cents: cents, bank_ref: bankRef || undefined }),
    });
    setSubmitting(false);
    if (res.status === 409) { setError("You already have a pending payout request."); return; }
    if (!res.ok)            { setError("Failed to submit — please try again."); return; }
    const { id } = await res.json() as { id: string };
    setDone(true);
    setShowForm(false);
    setRequests(prev => [{
      id, amount_cents: cents, bank_ref: bankRef || null,
      note: null, status: "PENDING",
      created_at: new Date().toISOString(), reviewed_at: null,
    }, ...prev]);
  };

  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
          Payout Requests
        </p>
        {!hasPending && !done && (
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 font-mono text-[10px] text-amber-400
                       border border-amber-900 bg-amber-950 px-2 py-1 rounded-sm
                       hover:border-amber-700 transition-colors"
          >
            <Send size={10} />
            Request Payout
          </button>
        )}
      </div>

      {showForm && (
        <div className="p-4 border-b border-zinc-800 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-mono text-[10px] text-zinc-600 block mb-1">Amount (USD)</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder={`Max ${usd(totalBalance)}`}
                className="w-full rounded-sm border border-zinc-700 bg-zinc-900 px-3 py-2
                           font-mono text-xs text-zinc-50 placeholder-zinc-600
                           focus:border-amber-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] text-zinc-600 block mb-1">Bank / IBAN (optional)</label>
              <input
                type="text"
                value={bankRef}
                onChange={e => setBankRef(e.target.value)}
                placeholder="IBAN or account ref"
                className="w-full rounded-sm border border-zinc-700 bg-zinc-900 px-3 py-2
                           font-mono text-xs text-zinc-50 placeholder-zinc-600
                           focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>
          {error && <p className="font-mono text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={submitting}
              className="flex-1 h-9 rounded-sm border border-amber-900 bg-amber-950
                         text-amber-400 font-mono text-xs uppercase tracking-widest
                         hover:border-amber-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
            <button
              onClick={() => { setShowForm(false); setError(null); }}
              className="h-9 px-3 rounded-sm border border-zinc-700 text-zinc-500
                         font-mono text-xs hover:border-zinc-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {done && (
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <p className="font-mono text-xs text-emerald-400">
            Payout request submitted — processed within 2 business days.
          </p>
        </div>
      )}

      {loadingReq ? (
        <div className="px-4 py-6 text-center">
          <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : requests.length === 0 ? (
        <p className="px-4 py-6 font-mono text-xs text-zinc-600 text-center">No payout requests yet.</p>
      ) : (
        requests.map(r => (
          <div key={r.id} className="flex items-center gap-4 px-4 py-3 border-b border-zinc-800/60 last:border-0">
            <div className="flex-1 min-w-0">
              <p className="font-mono text-xs text-zinc-300">{usd(r.amount_cents)}</p>
              <p className="font-mono text-[10px] text-zinc-600">{fmtDate(r.created_at)}</p>
              {r.bank_ref && <p className="font-mono text-[10px] text-zinc-700 truncate">{r.bank_ref}</p>}
            </div>
            <PayoutStatusBadge status={r.status} />
          </div>
        ))
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EarningsPage() {
  const [data,    setData]    = useState<BalanceResponse | null>(null);
  const [monthly, setMonthly] = useState<MonthlyEarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/freelancer/balance").then(r => r.ok ? r.json() as Promise<BalanceResponse> : Promise.reject(r.status)),
      fetch("/api/freelancer/earnings/monthly").then(r => r.ok ? r.json() as Promise<MonthlyEarningsResponse> : Promise.reject(r.status)),
    ])
      .then(([bal, mon]) => { setData(bal); setMonthly(mon); })
      .catch(e => setError(String(e)))
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

        {data && monthly && (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
              {monthly.effective_hourly_cents !== null && (
                <StatCard
                  label="Effective Rate"
                  value={`$${Math.round(monthly.effective_hourly_cents / 100)}/hr`}
                  sub={`${monthly.total_hours}h logged`}
                  icon={<DollarSign size={14} />}
                />
              )}
              {monthly.monthly.length > 0 && (() => {
                const last = monthly.monthly[monthly.monthly.length - 1];
                return (
                  <StatCard
                    label="This Month"
                    value={usd(last.earned_cents)}
                    sub={last.month}
                    icon={<ChevronRight size={14} />}
                  />
                );
              })()}
            </div>

            {/* Monthly chart */}
            <div className="border border-zinc-800 rounded-sm bg-zinc-900/40 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                  Monthly Earnings
                </p>
                <p className="font-mono text-[10px] text-zinc-600">Last 6 months</p>
              </div>
              <div className="px-4 py-3">
                <MonthlyChart data={monthly.monthly} />
              </div>
              {monthly.monthly.length > 0 && (
                <div className="px-4 pb-3 flex items-center gap-4">
                  {monthly.monthly.map(m => (
                    <div key={m.month} className="text-center flex-1">
                      <p className="font-mono text-[9px] text-zinc-400 tabular-nums">
                        {m.earned_cents > 0 ? usd(m.earned_cents) : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Payout request section */}
            <PayoutRequestSection totalBalance={data.total_earned_cents} />

            {/* Payout history */}
            <div className="border border-zinc-800 rounded-sm bg-zinc-900/40 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                  Payout History
                </p>
                <p className="font-mono text-[10px] text-zinc-600">
                  <Download size={10} className="inline mr-1" />
                  Click row icon for invoice
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
