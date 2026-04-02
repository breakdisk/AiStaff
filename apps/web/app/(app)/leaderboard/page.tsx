"use client";

import { useEffect, useState } from "react";
import { Trophy, AlertTriangle, TrendingUp } from "lucide-react";
import { fetchLeaderboard, type RoiReport } from "@/lib/api";

// ── Demo fallback ──────────────────────────────────────────────────────────────

const DEMO_LEADERBOARD: RoiReport[] = [
  { talent_id: "tal-00000001-0000-0000-0000-aaaaaaaaaaaa", display_name: "Alex Chen",      total_deployments: 18, total_earned_cents: 310500, avg_checklist_pass_pct: 0.94, drift_incidents: 0, reputation_score: 91.2 },
  { talent_id: "tal-00000002-0000-0000-0000-bbbbbbbbbbbb", display_name: "Jordan Rivera",  total_deployments: 12, total_earned_cents: 184500, avg_checklist_pass_pct: 0.87, drift_incidents: 1, reputation_score: 73.4 },
  { talent_id: "tal-00000003-0000-0000-0000-cccccccccccc", display_name: "Sam Okafor",     total_deployments: 9,  total_earned_cents: 127000, avg_checklist_pass_pct: 0.78, drift_incidents: 2, reputation_score: 61.8 },
  { talent_id: "tal-00000004-0000-0000-0000-dddddddddddd", display_name: "Taylor Novak",   total_deployments: 7,  total_earned_cents: 98000,  avg_checklist_pass_pct: 0.71, drift_incidents: 1, reputation_score: 55.0 },
  { talent_id: "tal-00000005-0000-0000-0000-eeeeeeeeeeee", display_name: "Morgan Liu",     total_deployments: 4,  total_earned_cents: 54000,  avg_checklist_pass_pct: 0.60, drift_incidents: 3, reputation_score: 38.7 },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 80) return "text-green-400";
  if (s >= 60) return "text-amber-400";
  return "text-zinc-400";
}

function fmtUSD(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(cents / 100);
}

function shortId(id: string) {
  return id.slice(0, 12) + "…";
}

// ── Rank badge ─────────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="w-4 h-4 text-amber-400" />;
  if (rank === 2) return <Trophy className="w-4 h-4 text-zinc-400" />;
  if (rank === 3) return <Trophy className="w-4 h-4 text-orange-700" />;
  return <span className="font-mono text-xs text-zinc-600 w-4 text-center">{rank}</span>;
}

// ── Desktop table row ──────────────────────────────────────────────────────────

function TableRow({ entry, rank }: { entry: RoiReport; rank: number }) {
  return (
    <tr className="border-b border-zinc-800 hover:bg-zinc-900 transition-colors">
      <td className="px-3 py-2">
        <RankBadge rank={rank} />
      </td>
      <td className="px-3 py-2">
        <span className="text-xs text-zinc-200 font-medium">
          {entry.display_name || shortId(entry.talent_id)}
        </span>
      </td>
      <td className="px-3 py-2">
        <span className={`font-mono text-sm font-medium tabular-nums ${scoreColor(entry.reputation_score)}`}>
          {entry.reputation_score.toFixed(1)}
        </span>
      </td>
      <td className="px-3 py-2 font-mono text-xs text-zinc-300 tabular-nums">{entry.total_deployments}</td>
      <td className="px-3 py-2 font-mono text-xs text-zinc-300 tabular-nums">{fmtUSD(entry.total_earned_cents)}</td>
      <td className="px-3 py-2 font-mono text-xs tabular-nums">
        <span className={`flex items-center gap-1 ${entry.drift_incidents > 0 ? "text-red-400" : "text-zinc-500"}`}>
          {entry.drift_incidents > 0 && <AlertTriangle className="w-3 h-3" />}
          {entry.drift_incidents}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-1 w-16 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${entry.reputation_score >= 80 ? "bg-green-500" : entry.reputation_score >= 60 ? "bg-amber-500" : "bg-zinc-600"}`}
              style={{ width: `${entry.reputation_score}%` }}
            />
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Mobile card ────────────────────────────────────────────────────────────────

function MobileCard({ entry, rank }: { entry: RoiReport; rank: number }) {
  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RankBadge rank={rank} />
          <span className="text-xs text-zinc-200 font-medium">
            {entry.display_name || shortId(entry.talent_id)}
          </span>
        </div>
        <span className={`font-mono text-lg font-medium tabular-nums ${scoreColor(entry.reputation_score)}`}>
          {entry.reputation_score.toFixed(1)}
        </span>
      </div>
      <div className="h-0.5 bg-zinc-800">
        <div
          className={`h-full ${entry.reputation_score >= 80 ? "bg-green-500" : entry.reputation_score >= 60 ? "bg-amber-500" : "bg-zinc-600"} transition-all`}
          style={{ width: `${entry.reputation_score}%` }}
        />
      </div>
      <div className="grid grid-cols-3 gap-x-2 text-xs">
        <span className="text-zinc-500">Deploys</span>
        <span className="text-zinc-500">Earned</span>
        <span className="text-zinc-500">Drift</span>
        <span className="font-mono text-zinc-200 tabular-nums">{entry.total_deployments}</span>
        <span className="font-mono text-zinc-200 tabular-nums">{fmtUSD(entry.total_earned_cents)}</span>
        <span className={`font-mono tabular-nums flex items-center gap-0.5 ${entry.drift_incidents > 0 ? "text-red-400" : "text-zinc-200"}`}>
          {entry.drift_incidents > 0 && <AlertTriangle className="w-3 h-3" />}
          {entry.drift_incidents}
        </span>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<RoiReport[]>(DEMO_LEADERBOARD);
  const [serviceStatus, setServiceStatus] = useState<"live" | "demo" | "loading">("loading");

  useEffect(() => {
    fetchLeaderboard(50)
      .then((data) => {
        if (data.length > 0) {
          setEntries(data);
          setServiceStatus("live");
        } else {
          setServiceStatus("demo");
        }
      })
      .catch(() => setServiceStatus("demo"));
  }, []);

  return (
      <main className="flex-1 p-4 pb-20 lg:pb-4 space-y-4 max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-3">
          <TrendingUp className="w-4 h-4 text-amber-400" />
          <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
            Talent Leaderboard
          </h1>
          <span className="font-mono text-xs text-zinc-600 ml-auto">
            {entries.length} talent
          </span>
        </div>

        {/* Desktop table — hidden on mobile */}
        <div className="hidden sm:block border border-zinc-800 rounded-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950">
                {["#", "Talent", "Score", "Deploys", "Earned", "Drift", ""].map((h) => (
                  <th key={h} className="px-3 py-2 font-mono text-xs text-zinc-500 uppercase tracking-widest font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <TableRow key={entry.talent_id} entry={entry} rank={i + 1} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="sm:hidden space-y-2">
          {entries.map((entry, i) => (
            <MobileCard key={entry.talent_id} entry={entry} rank={i + 1} />
          ))}
        </div>

        {/* Scoring legend */}
        <div className="border border-zinc-800 rounded-sm p-3">
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-2">Score Weights</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div>
              <p className="text-zinc-600">Checklist pass</p>
              <p className="text-zinc-300">40%</p>
            </div>
            <div>
              <p className="text-zinc-600">Drift-free rate</p>
              <p className="text-zinc-300">30%</p>
            </div>
            <div>
              <p className="text-zinc-600">Trust score</p>
              <p className="text-zinc-300">20%</p>
            </div>
            <div>
              <p className="text-zinc-600">Volume</p>
              <p className="text-zinc-300">10%</p>
            </div>
          </div>
        </div>
      </main>

      );
}
