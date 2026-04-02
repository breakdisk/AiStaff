"use client";

import { useEffect, useState } from "react";

type Deployment = {
  id: string; state: string; escrow_amount_cents: number;
  platform_fee_cents: number; seconds_in_state: number;
  created_at: string; updated_at: string;
};
type Detail = {
  deployment: Deployment & { is_stuck: boolean };
  escrow_payouts: { id: string; recipient_id: string; amount_cents: number; reason: string; created_at: string }[];
  platform_fees:  { id: string; fee_cents: number; fee_pct: number; created_at: string }[];
};

const STATE_COLORS: Record<string, string> = {
  VETO_WINDOW:       "text-amber-400",
  BIOMETRIC_PENDING: "text-blue-400",
  RELEASED:          "text-emerald-500",
  VETOED:            "text-red-500",
  FAILED:            "text-red-600",
};

function fmtUSD(cents: number) {
  return "$" + (cents / 100).toFixed(2);
}

export default function PayoutsPage() {
  const [rows, setRows]         = useState<Deployment[]>([]);
  const [stateFilter, setStateFilter] = useState("");
  const [page, setPage]         = useState(0);
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [reason, setReason]     = useState("");
  const [acting, setActing]     = useState(false);
  const [error, setError]       = useState("");

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (stateFilter) params.set("state", stateFilter);
    const r = await fetch(`/api/admin/payouts?${params}`);
    const d = await r.json() as { deployments: Deployment[] };
    setRows(d.deployments ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [page, stateFilter]); // eslint-disable-line

  async function openDetail(id: string) {
    const r = await fetch(`/api/admin/payouts/${id}`);
    const d = await r.json() as Detail;
    setSelected(d);
    setReason("");
    setError("");
  }

  async function forceRelease() {
    if (!selected || !reason.trim()) return;
    setActing(true);
    setError("");
    const r = await fetch(`/api/admin/payouts/${selected.deployment.id}/force-release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setActing(false);
    if (r.ok) { setSelected(null); load(); }
    else { const t = await r.json() as { error: string }; setError(t.error); }
  }

  async function forceVeto() {
    if (!selected) return;
    setActing(true);
    setError("");
    const r = await fetch(`/api/admin/payouts/${selected.deployment.id}/force-veto`, { method: "POST" });
    setActing(false);
    if (r.ok) { setSelected(null); load(); }
    else { const t = await r.json() as { error: string }; setError(t.error); }
  }

  const STATES = ["", "VETO_WINDOW", "BIOMETRIC_PENDING", "RELEASED", "VETOED", "FAILED"];

  return (
    <div>
      <h1 className="text-base font-semibold text-zinc-50 mb-4">Payout Management</h1>
      <div className="flex gap-2 mb-4">
        <select value={stateFilter} onChange={e => { setStateFilter(e.target.value); setPage(0); }}
          className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded-sm">
          {STATES.map(s => <option key={s} value={s}>{s || "ALL"}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-zinc-300">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500 text-left">
              <th className="pb-2 pr-4">Deployment ID</th>
              <th className="pb-2 pr-4">State</th>
              <th className="pb-2 pr-4">Escrow</th>
              <th className="pb-2 pr-4">Platform Fee</th>
              <th className="pb-2 pr-4">Age</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="text-zinc-500 py-4">Loading…</td></tr>}
            {!loading && rows.map(dep => (
              <tr key={dep.id} onClick={() => openDetail(dep.id)}
                className="border-b border-zinc-900 hover:bg-zinc-900/50 cursor-pointer">
                <td className="py-2 pr-4 font-mono">{dep.id.slice(0, 8)}…</td>
                <td className={`py-2 pr-4 font-mono ${STATE_COLORS[dep.state] ?? "text-zinc-400"}`}>{dep.state}</td>
                <td className="py-2 pr-4 font-mono">{fmtUSD(dep.escrow_amount_cents)}</td>
                <td className="py-2 pr-4 font-mono text-amber-400">{fmtUSD(dep.platform_fee_cents)}</td>
                <td className="py-2 pr-4 text-zinc-500">{Math.floor(dep.seconds_in_state / 3600)}h</td>
              </tr>
            ))}
            {!loading && !rows.length && <tr><td colSpan={5} className="text-zinc-500 py-4">No deployments found</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 mt-3">
        <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="text-xs text-zinc-400 disabled:opacity-30">← Prev</button>
        <span className="text-xs text-zinc-500">Page {page + 1}</span>
        <button onClick={() => setPage(p => p + 1)} className="text-xs text-zinc-400">Next →</button>
      </div>
      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end">
          <div className="w-full max-w-lg bg-zinc-950 border-l border-zinc-800 overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-zinc-50">Deployment Detail</h2>
              <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-zinc-300 text-xs">✕ Close</button>
            </div>
            <div className="space-y-1 text-xs mb-4">
              <div className="flex justify-between"><span className="text-zinc-500">ID</span><span className="font-mono text-zinc-300">{selected.deployment.id}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">State</span>
                <span className={`font-mono ${STATE_COLORS[selected.deployment.state] ?? ""}`}>{selected.deployment.state}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Escrow</span>
                <span className="font-mono text-zinc-300">{fmtUSD(selected.deployment.escrow_amount_cents)}</span></div>
            </div>
            {selected.escrow_payouts.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Escrow Payouts</p>
                {selected.escrow_payouts.map(p => (
                  <div key={p.id} className="flex justify-between text-xs py-1 border-b border-zinc-900">
                    <span className="text-zinc-400 truncate max-w-[180px]">{p.reason}</span>
                    <span className="font-mono text-emerald-500">{fmtUSD(p.amount_cents)}</span>
                  </div>
                ))}
              </div>
            )}
            {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
            {selected.deployment.state === "BIOMETRIC_PENDING" && selected.deployment.is_stuck && (
              <div className="mb-3 space-y-2">
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Force Release</p>
                <input type="text" placeholder="Reason (required)" value={reason} onChange={e => setReason(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-2 py-1.5 rounded-sm" />
                <button disabled={!reason.trim() || acting} onClick={forceRelease}
                  className="w-full bg-amber-500 disabled:opacity-40 text-zinc-950 text-xs font-semibold py-1.5 rounded-sm">
                  {acting ? "Processing…" : "Force Release Escrow"}
                </button>
              </div>
            )}
            {selected.deployment.state === "VETO_WINDOW" && (
              <button disabled={acting} onClick={forceVeto}
                className="w-full bg-red-600 disabled:opacity-40 text-white text-xs font-semibold py-1.5 rounded-sm">
                {acting ? "Processing…" : "Force Veto"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
