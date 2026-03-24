"use client";

import { useEffect, useState } from "react";

type Announcement = { id: string; title: string; body: string; severity: "info" | "warning" | "urgent" };

const SEV: Record<string, string> = {
  info:    "bg-zinc-800 border-zinc-700 text-zinc-300",
  warning: "bg-amber-950/40 border-amber-800 text-amber-300",
  urgent:  "bg-red-950/40 border-red-800 text-red-400",
};

export function AnnouncementBanner() {
  const [ann, setAnn]             = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/announcements")
      .then(r => r.json())
      .then((d: { announcements: Announcement[] }) => {
        const latest = d.announcements?.[0];
        if (!latest) return;
        if (localStorage.getItem(`dismissed_${latest.id}`) === "1") return;
        setAnn(latest);
      })
      .catch(() => { /* non-fatal — never crash the page */ });
  }, []);

  function dismiss() {
    if (!ann) return;
    localStorage.setItem(`dismissed_${ann.id}`, "1");
    setDismissed(true);
  }

  if (!ann || dismissed) return null;

  return (
    <div className={`border rounded-sm px-4 py-2.5 mb-4 flex items-start justify-between gap-3 ${SEV[ann.severity] ?? SEV.info}`}>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold">{ann.title}</p>
        <p className="text-xs opacity-80 mt-0.5">{ann.body}</p>
      </div>
      <button onClick={dismiss} className="text-xs opacity-60 hover:opacity-100 flex-shrink-0 mt-0.5">✕</button>
    </div>
  );
}
