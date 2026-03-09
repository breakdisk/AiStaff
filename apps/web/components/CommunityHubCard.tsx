"use client";

import { Users, Globe, Lock } from "lucide-react";

export interface Hub {
  id:           string;
  slug:         string;
  name:         string;
  description:  string;
  category:     string;
  timezone:     string;
  member_count: number;
  is_private:   boolean;
}

interface Props {
  hub:      Hub;
  onJoin?:  (hubId: string) => void;
  joined?:  boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  aistaff:  "text-amber-400 bg-amber-400/10",
  airobot:  "text-sky-400  bg-sky-400/10",
  aitalent: "text-emerald-400 bg-emerald-400/10",
  general:  "text-zinc-400 bg-zinc-800",
};

export default function CommunityHubCard({ hub, onJoin, joined }: Props) {
  const colorCls = CATEGORY_COLORS[hub.category] ?? CATEGORY_COLORS.general;

  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-sm ${colorCls}`}>
              {hub.category}
            </span>
            {hub.is_private && (
              <Lock size={12} className="text-zinc-500 shrink-0" />
            )}
          </div>
          <h3 className="text-sm font-semibold text-zinc-100 truncate">{hub.name}</h3>
        </div>
        <button
          onClick={() => onJoin?.(hub.id)}
          disabled={joined}
          className={`text-xs font-medium px-3 py-1 rounded-sm shrink-0 transition-colors
            ${joined
              ? "bg-zinc-800 text-zinc-500 cursor-default"
              : "bg-amber-400 text-zinc-950 hover:bg-amber-300"
            }`}
        >
          {joined ? "Joined" : "Join"}
        </button>
      </div>

      {/* Description */}
      {hub.description && (
        <p className="text-xs text-zinc-400 line-clamp-2">{hub.description}</p>
      )}

      {/* Footer meta */}
      <div className="flex items-center gap-4 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1">
          <Users size={11} />
          {hub.member_count.toLocaleString()} members
        </span>
        <span className="flex items-center gap-1">
          <Globe size={11} />
          {hub.timezone}
        </span>
      </div>
    </div>
  );
}
