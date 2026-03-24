"use client";

import { useEffect, useState } from "react";

type Claim = {
  id: string; deployment_id: string; claimant_id: string;
  drift_proof: string; claimed_at: string; resolved_at: string | null;
  resolution: string | null; escrow_amount_cents: number; deployment_state: string;
};

const RESOLUTION_COLORS: Record<string, string> = {
  REMEDIATED: "text-emerald-500",
  REFUNDED:   "text-blue-400",
  REJECTED:   "text-red-500",
};

export default function WarrantyClaimsPage() {
  const [rows, setRows]         = useState<Claim[]>([]);
  const [filter, setFilter]     = useState("");
  const [page, setPage]         = useState(0);
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState<Claim | null>(null);
  const [acting, setActing]     = useState(false);
  const [error, setError]       = useState("");

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (filter) params.set("resolution", filter);
    const r = await fetch(`/api/admin/warranty-claims?${params}`);
    const d = await r.json() as { claims: Claim[] };
    setRows(d.claims ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [page, filter]); // eslint-disable-line

  async function resolve(resolution: "REMEDIATED" | "REFUNDED" | "REJECTED") {
    if (!selected) return;
    setActing(true);
    setError("");
    const r = await fetch(`/api/admin/warranty-claims/${selected.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolution }),
    });
    setActing(false);
    if (r.ok) { setSelected(null); load(); }
    else { const t = await r.json() as { error: string }; setError(t.error); }
  }

  const FILTERS = ["", "PENDING", "REMEDIATED", "REFUNDED", "REJECTED"];

  return (
    <div>
      <h1 className="text-base font-semibold text-zinc-50 mb-4">Warranty Claims</h1>
      <div className="flex gap-2 mb-4">
        <select value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}
          className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded-sm">
          {FILTERS.map(f => <option key={f} value={f}>{f || "ALL"}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-zinc-300">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500 text-left">
              <th className="pb-2 pr-4">Claim ID</th>
              <th className="pb-2 pr-4">Deployment</th>
              <th className="pb-2 pr-4">Claimed</th>
              <th className="pb-2 pr-4">Resolution</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="text-zinc-500 py-4">Loading…</td></tr>}
            {!loading && rows.map(c => (
              <tr key={c.id} onClick={() => { setSelected(c); setError(""); }}
                className="border-b border-zinc-900 hover:bg-zinc-900/50 cursor-pointer">
                <td className="py-2 pr-4 font-mono">{c.id.slice(0, 8)}…</td>
                <td className="py-2 pr-4 font-mono">{c.deployment_id.slice(0, 8)}…</td>
                <td className="py-2 pr-4 text-zinc-500">{new Date(c.claimed_at).toLocaleDateString()}</td>
                <td className={`py-2 pr-4 font-mono ${RESOLUTION_COLORS[c.resolution ?? ""] ?? "text-zinc-500"}`}>
                  {c.resolution ?? "PENDING"}
                </td>
              </tr>
            ))}
            {!loading && !rows.length && <tr><td colSpan={4} className="text-zinc-500 py-4">No claims</td></tr>}
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
              <h2 className="text-sm font-semibold text-zinc-50">Claim Detail</h2>
              <button onClick={() => setSelected(null)} className="text-zinc-500 text-xs">✕</button>
            </div>
            <div className="space-y-1 text-xs mb-4">
              <div className="flex justify-between"><span className="text-zinc-500">Deployment Escrow</span>
                <span className="font-mono">${(selected.escrow_amount_cents / 100).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Deployment State</span>
                <span className="font-mono text-zinc-400">{selected.deployment_state}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Claimed At</span>
                <span className="text-zinc-400">{new Date(selected.claimed_at).toLocaleString()}</span></div>
            </div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Drift Proof</p>
            <pre className="bg-zinc-900 p-2 text-[10px] font-mono text-zinc-400 max-h-48 overflow-y-auto mb-4 rounded-sm whitespace-pre-wrap">
              {selected.drift_proof}
            </pre>
            {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
            {!selected.resolution ? (
              <div className="flex gap-2">
                {(["REMEDIATED", "REFUNDED", "REJECTED"] as const).map(res => (
                  <button key={res} disabled={acting} onClick={() => resolve(res)}
                    className={`flex-1 text-xs font-semibold py-1.5 rounded-sm disabled:opacity-40 ${
                      res === "REMEDIATED" ? "bg-emerald-600 text-white" :
                      res === "REFUNDED"   ? "bg-blue-600 text-white" :
                                            "bg-zinc-800 text-zinc-300"
                    }`}>
                    {acting ? "…" : res}
                  </button>
                ))}
              </div>
            ) : (
              <p className={`text-xs font-mono ${RESOLUTION_COLORS[selected.resolution] ?? ""}`}>
                Resolved: {selected.resolution} · {selected.resolved_at ? new Date(selected.resolved_at).toLocaleString() : "—"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
