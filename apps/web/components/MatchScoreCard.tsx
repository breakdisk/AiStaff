"use client";

import { Users, Zap } from "lucide-react";

/** Mirrors SOW_THRESHOLD in crates/matching_service/src/orchestrator.rs */
const SOW_THRESHOLD = 0.85;

interface TalentMatch {
  talent_id:   string;
  match_score: number; // 0.0 – 1.0
  trust_score: number; // 0 – 100
  skill_tags:  string[];
}

interface MatchScoreCardProps {
  agentId: string;
  matches: TalentMatch[];
}

function scoreColor(score: number): string {
  if (score >= 0.8) return "text-green-400";
  if (score >= 0.5) return "text-amber-400";
  return "text-zinc-500";
}

function tierLabel(trust: number): string {
  if (trust >= 70) return "T2";
  if (trust >= 40) return "T1";
  return "T0";
}

function tierColor(trust: number): string {
  if (trust >= 70) return "bg-green-950 text-green-400";
  if (trust >= 40) return "bg-amber-950 text-amber-400";
  return "bg-zinc-900 text-zinc-500";
}

export default function MatchScoreCard({ agentId, matches }: MatchScoreCardProps) {
  const sorted = [...matches].sort((a, b) => b.match_score - a.match_score);

  return (
    <div className="border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Users size={14} className="text-zinc-400 shrink-0" />
        <span className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">
          Talent Matches
        </span>
        <span className="ml-auto font-mono text-xs text-zinc-600">
          {agentId.slice(0, 8)}
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-zinc-600 text-center py-2">No matches found</p>
      ) : (
        <ul className="space-y-px">
          {sorted.map((m, i) => (
            <li
              key={m.talent_id}
              className="flex items-center gap-2 h-8 px-1 border-b border-zinc-900 last:border-0"
            >
              {/* Rank */}
              <span className="font-mono text-xs text-zinc-600 w-4 shrink-0">
                {i + 1}
              </span>

              {/* Talent ID (truncated) */}
              <span className="font-mono text-xs text-zinc-300 truncate flex-1">
                {m.talent_id.slice(0, 8)}…
              </span>

              {/* Trust tier badge */}
              <span
                className={`font-mono text-[10px] font-semibold px-1 ${tierColor(m.trust_score)}`}
              >
                {tierLabel(m.trust_score)}
              </span>

              {/* Auto-SOW indicator — shown when bot orchestrator would fire */}
              {m.match_score >= SOW_THRESHOLD && (
                <span
                  className="font-mono text-[9px] px-1 border border-amber-800 text-amber-400 shrink-0"
                  title="Bot Orchestrator will auto-propose SOW"
                >
                  <Zap size={8} className="inline -mt-px" /> SOW
                </span>
              )}

              {/* Match score */}
              <span className={`font-mono text-xs font-semibold w-10 text-right ${scoreColor(m.match_score)}`}>
                {(m.match_score * 100).toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
