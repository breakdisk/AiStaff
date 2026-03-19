"use client";

import { useState, useEffect } from "react";
import { MessageSquare, ExternalLink } from "lucide-react";

interface Engagement {
  id:                  string;
  agent_name:          string;
  state:               string;
  escrow_amount_cents: number;
  created_at:          string;
}

export default function MyEngagementsWidget() {
  const [engagements, setEngagements] = useState<Engagement[] | null>(null);

  useEffect(() => {
    fetch("/api/marketplace/my-deployments")
      .then(r => r.ok ? r.json() : [])
      .then(setEngagements)
      .catch(() => setEngagements([]));
  }, []);

  const stateCls = (state: string) =>
    state === "RELEASED" ? "text-emerald-400" :
    state === "VETOED"   ? "text-red-400" :
    state === "FAILED"   ? "text-red-500" :
    "text-amber-400";

  if (engagements === null) {
    return (
      <div className="border border-zinc-800 rounded-sm px-3 py-3">
        <p className="font-mono text-[10px] text-zinc-600">Loading…</p>
      </div>
    );
  }

  if (engagements.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-sm px-3 py-4 text-center">
        <p className="font-mono text-[10px] text-zinc-600">No engagements yet</p>
        <a
          href="/marketplace"
          className="inline-flex items-center gap-1 mt-2 font-mono text-[9px] text-amber-400 hover:text-amber-300"
        >
          <ExternalLink className="w-2.5 h-2.5" /> Browse Marketplace
        </a>
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 rounded-sm overflow-hidden">
      <div className="divide-y divide-zinc-800">
        {engagements.map(eng => (
          <div key={eng.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0">
              <p className="font-mono text-xs text-zinc-100 truncate">{eng.agent_name}</p>
              <p className="font-mono text-[9px] text-zinc-600">
                {eng.created_at} · <span className={stateCls(eng.state)}>{eng.state}</span>
              </p>
              <p className="font-mono text-[9px] text-zinc-600 mt-0.5 select-all">{eng.id}</p>
            </div>
            <a
              href={`/collab?deployment_id=${eng.id}`}
              className="flex-shrink-0 flex items-center gap-1 font-mono text-[9px] text-amber-400 border border-amber-900 bg-amber-950/40 px-2 h-6 rounded-sm hover:border-amber-700 transition-colors"
            >
              <MessageSquare className="w-2.5 h-2.5" /> Collaborate
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
