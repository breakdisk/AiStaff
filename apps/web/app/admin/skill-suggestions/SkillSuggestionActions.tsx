"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

type Suggestion = {
  id: string;
  tag: string;
  status: string;
};

export function SkillSuggestionActions({ suggestion }: { suggestion: Suggestion }) {
  const [busy, setBusy] = useState(false);

  async function handle(action: "approve" | "reject") {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/skill-suggestions/${suggestion.id}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error ?? `Failed: ${res.status}`);
        return;
      }
      window.location.reload();
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (suggestion.status !== "pending") {
    return (
      <span className="font-mono text-[11px] text-zinc-600">—</span>
    );
  }

  return (
    <div className="flex gap-1">
      <button
        disabled={busy}
        onClick={() => handle("approve")}
        className="text-[11px] px-2 py-0.5 border border-emerald-800 text-emerald-400
                   hover:bg-emerald-900/30 disabled:opacity-50 transition-colors"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Approve"}
      </button>
      <button
        disabled={busy}
        onClick={() => handle("reject")}
        className="text-[11px] px-2 py-0.5 border border-red-900 text-red-400
                   hover:bg-red-900/30 disabled:opacity-50 transition-colors"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Reject"}
      </button>
    </div>
  );
}
