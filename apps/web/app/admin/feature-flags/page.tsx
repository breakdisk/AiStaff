"use client";

import { useEffect, useState } from "react";

type Flag = { name: string; enabled: boolean; description: string; updated_at: string; updated_by: string | null };

export default function FeatureFlagsPage() {
  const [flags, setFlags]       = useState<Flag[]>([]);
  const [loading, setLoading]   = useState(false);
  const [newName, setNewName]   = useState("");
  const [newDesc, setNewDesc]   = useState("");
  const [newEnabled, setNewEnabled] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState("");

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/feature-flags");
    const d = await r.json() as { flags: Flag[] };
    setFlags(d.flags ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggle(flag: Flag) {
    const optimistic = flags.map(f => f.name === flag.name ? { ...f, enabled: !f.enabled } : f);
    setFlags(optimistic);
    const r = await fetch(`/api/admin/feature-flags/${flag.name}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !flag.enabled }),
    });
    if (!r.ok) { setFlags(flags); }
    else { const updated = await r.json() as Flag; setFlags(prev => prev.map(f => f.name === updated.name ? updated : f)); }
  }

  async function createFlag() {
    setError("");
    if (!/^[a-z][a-z0-9_]*$/.test(newName)) { setError("Name must match ^[a-z][a-z0-9_]*$"); return; }
    setCreating(true);
    const r = await fetch("/api/admin/feature-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, description: newDesc, enabled: newEnabled }),
    });
    setCreating(false);
    if (r.ok) { setNewName(""); setNewDesc(""); setNewEnabled(false); load(); }
    else { const t = await r.json() as { error: string }; setError(t.error); }
  }

  return (
    <div>
      <h1 className="text-base font-semibold text-zinc-50 mb-4">Feature Flags</h1>
      {loading && <p className="text-zinc-500 text-xs">Loading…</p>}
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-xs text-zinc-300">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500 text-left">
              <th className="pb-2 pr-4">Flag</th><th className="pb-2 pr-4">Description</th>
              <th className="pb-2 pr-4">Enabled</th><th className="pb-2 pr-4">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {flags.map(f => (
              <tr key={f.name} className="border-b border-zinc-900">
                <td className="py-2 pr-4 font-mono text-zinc-200">{f.name}</td>
                <td className="py-2 pr-4 text-zinc-400 max-w-xs">{f.description}</td>
                <td className="py-2 pr-4">
                  <button onClick={() => toggle(f)} className={`w-10 h-5 rounded-full relative transition-colors ${f.enabled ? "bg-amber-400" : "bg-zinc-700"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${f.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </td>
                <td className="py-2 pr-4 text-zinc-500">{new Date(f.updated_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {!loading && !flags.length && <tr><td colSpan={4} className="text-zinc-500 py-4">No flags</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4">
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3">Create Flag</p>
        {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="text-[10px] text-zinc-500 block mb-1">Name (slug)</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="my_flag"
              className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs px-2 py-1.5 rounded-sm w-40 font-mono" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="text-[10px] text-zinc-500 block mb-1">Description</label>
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What this controls"
              className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs px-2 py-1.5 rounded-sm w-full" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 block mb-1">Enabled</label>
            <input type="checkbox" checked={newEnabled} onChange={e => setNewEnabled(e.target.checked)} className="accent-amber-400" />
          </div>
          <button disabled={creating || !newName} onClick={createFlag}
            className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-zinc-200 text-xs px-3 py-1.5 rounded-sm">
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
