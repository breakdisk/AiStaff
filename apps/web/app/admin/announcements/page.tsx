"use client";

import { useEffect, useState } from "react";

type Announcement = {
  id: string; title: string; body: string; severity: string;
  starts_at: string; expires_at: string | null; is_active: boolean; created_at: string;
};

const SEV_CLASSES: Record<string, string> = {
  info:    "text-zinc-300 border-zinc-700",
  warning: "text-amber-300 border-amber-800",
  urgent:  "text-red-400  border-red-800",
};

export default function AnnouncementsPage() {
  const [rows, setRows]         = useState<Announcement[]>([]);
  const [loading, setLoading]   = useState(false);
  const [title, setTitle]       = useState("");
  const [body, setBody]         = useState("");
  const [severity, setSeverity] = useState<"info" | "warning" | "urgent">("info");
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState("");

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/announcements");
    const d = await r.json() as { announcements: Announcement[] };
    setRows(d.announcements ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function create() {
    if (!title.trim() || !body.trim()) { setError("Title and body are required"); return; }
    setCreating(true);
    setError("");
    const r = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, severity, expires_at: expiresAt || undefined }),
    });
    setCreating(false);
    if (r.ok) { setTitle(""); setBody(""); setSeverity("info"); setExpiresAt(""); load(); }
    else { const t = await r.json() as { error: string }; setError(t.error); }
  }

  async function del(id: string) {
    await fetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <h1 className="text-base font-semibold text-zinc-50 mb-4">System Announcements</h1>
      <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4 mb-6">
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3">New Announcement</p>
        {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
        <div className="space-y-2">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title"
            className="w-full bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs px-2 py-1.5 rounded-sm" />
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Body"
            rows={3} className="w-full bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs px-2 py-1.5 rounded-sm resize-none" />
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex gap-1">
              {(["info", "warning", "urgent"] as const).map(s => (
                <button key={s} onClick={() => setSeverity(s)}
                  className={`text-xs px-2 py-1 rounded-sm border ${severity === s ? "border-amber-400 text-amber-400" : "border-zinc-800 text-zinc-500"}`}>{s}</button>
              ))}
            </div>
            <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-400 text-xs px-2 py-1 rounded-sm" />
            <button disabled={creating} onClick={create}
              className="bg-amber-500 disabled:opacity-40 text-zinc-950 text-xs font-semibold px-3 py-1.5 rounded-sm">
              {creating ? "Publishing…" : "Publish"}
            </button>
          </div>
        </div>
      </div>
      {loading && <p className="text-zinc-500 text-xs">Loading…</p>}
      <div className="space-y-2">
        {rows.map(a => (
          <div key={a.id} className={`bg-zinc-900 border rounded-sm p-3 ${SEV_CLASSES[a.severity] ?? "border-zinc-800"}`}>
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-sm border ${SEV_CLASSES[a.severity]}`}>{a.severity}</span>
                  {a.is_active ? <span className="text-[10px] text-emerald-500">● Active</span> : <span className="text-[10px] text-zinc-600">● Inactive</span>}
                </div>
                <p className="text-xs font-semibold text-zinc-100 mb-0.5">{a.title}</p>
                <p className="text-xs text-zinc-400 line-clamp-2">{a.body}</p>
                <p className="text-[10px] text-zinc-600 mt-1">Expires: {a.expires_at ? new Date(a.expires_at).toLocaleString() : "Never"}</p>
              </div>
              <button onClick={() => del(a.id)} className="text-zinc-600 hover:text-red-500 text-xs ml-3 flex-shrink-0">Delete</button>
            </div>
          </div>
        ))}
        {!loading && !rows.length && <p className="text-zinc-500 text-xs">No announcements</p>}
      </div>
    </div>
  );
}
