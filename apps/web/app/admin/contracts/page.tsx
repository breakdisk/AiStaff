"use client";

import { useEffect, useState } from "react";

type Contract = {
  id: string; contract_type: string; status: string;
  party_a_email: string | null; party_b_email: string | null;
  deployment_id: string | null; created_at: string; signed_at: string | null;
  document_hash: string; document_preview: string;
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT:             "text-zinc-400",
  PENDING_SIGNATURE: "text-amber-400",
  SIGNED:            "text-emerald-500",
  EXPIRED:           "text-zinc-500",
  REVOKED:           "text-red-500",
};

export default function ContractsPage() {
  const [rows, setRows]         = useState<Contract[]>([]);
  const [status, setStatus]     = useState("");
  const [page, setPage]         = useState(0);
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState<Contract | null>(null);
  const [acting, setActing]     = useState(false);
  const [error, setError]       = useState("");

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set("status", status);
    const r = await fetch(`/api/admin/contracts?${params}`);
    const d = await r.json() as { contracts: Contract[] };
    setRows(d.contracts ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [page, status]); // eslint-disable-line

  async function revoke() {
    if (!selected) return;
    setActing(true);
    setError("");
    const r = await fetch(`/api/admin/contracts/${selected.id}/revoke`, { method: "POST" });
    setActing(false);
    if (r.ok) { setSelected(null); load(); }
    else { const t = await r.json() as { error: string }; setError(t.error); }
  }

  const STATUSES = ["", "DRAFT", "PENDING_SIGNATURE", "SIGNED", "EXPIRED", "REVOKED"];
  const canRevoke = (s: string) => s === "DRAFT" || s === "PENDING_SIGNATURE";

  return (
    <div>
      <h1 className="text-base font-semibold text-zinc-50 mb-4">Contract Management</h1>
      <div className="flex gap-2 mb-4">
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}
          className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded-sm">
          {STATUSES.map(s => <option key={s} value={s}>{s || "ALL"}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-zinc-300">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500 text-left">
              <th className="pb-2 pr-4">ID</th><th className="pb-2 pr-4">Type</th>
              <th className="pb-2 pr-4">Party A</th><th className="pb-2 pr-4">Party B</th>
              <th className="pb-2 pr-4">Status</th><th className="pb-2 pr-4">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="text-zinc-500 py-4">Loading…</td></tr>}
            {!loading && rows.map(c => (
              <tr key={c.id} onClick={() => { setSelected(c); setError(""); }}
                className="border-b border-zinc-900 hover:bg-zinc-900/50 cursor-pointer">
                <td className="py-2 pr-4 font-mono">{c.id.slice(0, 8)}…</td>
                <td className="py-2 pr-4 text-zinc-400">{c.contract_type}</td>
                <td className="py-2 pr-4 text-zinc-400">{c.party_a_email ?? "—"}</td>
                <td className="py-2 pr-4 text-zinc-400">{c.party_b_email ?? "—"}</td>
                <td className={`py-2 pr-4 font-mono ${STATUS_COLORS[c.status] ?? ""}`}>{c.status}</td>
                <td className="py-2 pr-4 text-zinc-500">{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {!loading && !rows.length && <tr><td colSpan={6} className="text-zinc-500 py-4">No contracts</td></tr>}
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
              <h2 className="text-sm font-semibold text-zinc-50">Contract Detail</h2>
              <button onClick={() => setSelected(null)} className="text-zinc-500 text-xs">✕</button>
            </div>
            <div className="space-y-1 text-xs mb-4">
              <div className="flex justify-between"><span className="text-zinc-500">Type</span><span className="text-zinc-300">{selected.contract_type}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Status</span>
                <span className={`font-mono ${STATUS_COLORS[selected.status] ?? ""}`}>{selected.status}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">SHA-256</span>
                <span className="font-mono text-zinc-400 text-[10px]">{selected.document_hash.slice(0, 20)}…</span></div>
              {selected.signed_at && <div className="flex justify-between">
                <span className="text-zinc-500">Signed</span><span className="text-zinc-400">{new Date(selected.signed_at).toLocaleString()}</span></div>}
            </div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Document Preview</p>
            <pre className="bg-zinc-900 p-2 text-[10px] font-mono text-zinc-400 max-h-48 overflow-y-auto mb-4 rounded-sm whitespace-pre-wrap">
              {selected.document_preview}
            </pre>
            {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
            {canRevoke(selected.status) && (
              <button disabled={acting} onClick={revoke}
                className="w-full bg-red-700 disabled:opacity-40 text-white text-xs font-semibold py-1.5 rounded-sm">
                {acting ? "Revoking…" : "Revoke Contract"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
