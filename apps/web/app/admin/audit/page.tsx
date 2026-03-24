"use client";

import { useEffect, useState } from "react";

type Tab = "escrow" | "tool-calls" | "identity";

export default function AuditPage() {
  const [tab, setTab]     = useState<Tab>("escrow");
  const [rows, setRows]   = useState<Record<string, unknown>[]>([]);
  const [page, setPage]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [decision, setDecision] = useState("");
  const [eventType, setEventType] = useState("");
  const [from, setFrom]   = useState("");
  const [to, setTo]       = useState("");

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (from) params.set("from", from);
    if (to)   params.set("to", to);
    if (tab === "tool-calls" && decision) params.set("decision", decision);
    if (tab === "identity"   && eventType) params.set("event_type", eventType);
    const r = await fetch(`/api/admin/audit/${tab}?${params}`);
    const d = await r.json() as { rows: Record<string, unknown>[] };
    setRows(d.rows ?? []);
    setLoading(false);
  }

  useEffect(() => { setPage(0); setRows([]); }, [tab]); // eslint-disable-line
  useEffect(() => { load(); }, [tab, page, decision, eventType, from, to]); // eslint-disable-line

  const TABS: { key: Tab; label: string }[] = [
    { key: "escrow",     label: "Escrow" },
    { key: "tool-calls", label: "Tool Calls" },
    { key: "identity",   label: "Identity" },
  ];

  return (
    <div>
      <h1 className="text-base font-semibold text-zinc-50 mb-4">Audit Log</h1>
      <div className="flex gap-1 mb-4">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`text-xs px-3 py-1.5 rounded-sm border ${
              tab === t.key ? "border-amber-400 text-amber-400" : "border-zinc-800 text-zinc-500 hover:border-zinc-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded-sm" />
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded-sm" />
        {tab === "tool-calls" && (
          <select value={decision} onChange={e => setDecision(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded-sm">
            <option value="">ALL</option>
            <option>ALLOWED</option>
            <option>DENIED</option>
          </select>
        )}
        {tab === "identity" && (
          <input type="text" placeholder="Event type filter" value={eventType} onChange={e => setEventType(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded-sm w-40" />
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-zinc-300">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500 text-left">
              {tab === "escrow" && <><th className="pb-2 pr-4">Deployment</th><th className="pb-2 pr-4">Recipient</th><th className="pb-2 pr-4">Amount</th><th className="pb-2 pr-4">Reason</th><th className="pb-2 pr-4">Date</th></>}
              {tab === "tool-calls" && <><th className="pb-2 pr-4">Deployment</th><th className="pb-2 pr-4">Tool</th><th className="pb-2 pr-4">Decision</th><th className="pb-2 pr-4">Called At</th></>}
              {tab === "identity" && <><th className="pb-2 pr-4">Profile</th><th className="pb-2 pr-4">Event</th><th className="pb-2 pr-4">Tier</th><th className="pb-2 pr-4">Score</th><th className="pb-2 pr-4">Date</th></>}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="text-zinc-500 py-4">Loading…</td></tr>}
            {!loading && rows.map((row, i) => (
              <tr key={i} className="border-b border-zinc-900">
                {tab === "escrow" && <>
                  <td className="py-1.5 pr-4 font-mono">{String(row.deployment_id ?? "").slice(0, 8)}…</td>
                  <td className="py-1.5 pr-4 font-mono">{String(row.recipient_id ?? "").slice(0, 8)}…</td>
                  <td className="py-1.5 pr-4 font-mono text-emerald-500">${(Number(row.amount_cents) / 100).toFixed(2)}</td>
                  <td className="py-1.5 pr-4 text-zinc-400">{String(row.reason ?? "")}</td>
                  <td className="py-1.5 pr-4 text-zinc-500">{new Date(String(row.created_at)).toLocaleDateString()}</td>
                </>}
                {tab === "tool-calls" && <>
                  <td className="py-1.5 pr-4 font-mono">{String(row.deployment_id ?? "").slice(0, 8)}…</td>
                  <td className="py-1.5 pr-4 font-mono text-zinc-300">{String(row.tool_name ?? "")}</td>
                  <td className={`py-1.5 pr-4 font-mono ${row.decision === "ALLOWED" ? "text-emerald-500" : "text-red-500"}`}>{String(row.decision ?? "")}</td>
                  <td className="py-1.5 pr-4 text-zinc-500">{new Date(String(row.called_at)).toLocaleDateString()}</td>
                </>}
                {tab === "identity" && <>
                  <td className="py-1.5 pr-4 font-mono">{String(row.profile_id ?? "").slice(0, 8)}…</td>
                  <td className="py-1.5 pr-4 text-zinc-400">{String(row.event_type ?? "")}</td>
                  <td className="py-1.5 pr-4 text-zinc-500">{String(row.old_tier ?? "—")} → {String(row.new_tier ?? "—")}</td>
                  <td className="py-1.5 pr-4 text-zinc-500">{String(row.old_score ?? "—")} → {String(row.new_score ?? "—")}</td>
                  <td className="py-1.5 pr-4 text-zinc-500">{new Date(String(row.created_at)).toLocaleDateString()}</td>
                </>}
              </tr>
            ))}
            {!loading && !rows.length && <tr><td colSpan={5} className="text-zinc-500 py-4">No records</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 mt-3">
        <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="text-xs text-zinc-400 disabled:opacity-30">← Prev</button>
        <span className="text-xs text-zinc-500">Page {page + 1}</span>
        <button onClick={() => setPage(p => p + 1)} className="text-xs text-zinc-400">Next →</button>
      </div>
    </div>
  );
}
