"use client";

import { Activity, AlertTriangle, CheckCircle } from "lucide-react";

interface Heartbeat {
  cpu_pct:      number;
  mem_bytes:    number;
  artifact_hash: string;
  recorded_at:  string;
}

interface AgentHealthWidgetProps {
  deploymentId: string;
  heartbeats:   Heartbeat[];
  driftCount:   number;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`;
  if (bytes >= 1024 * 1024)        return `${(bytes / 1024 / 1024).toFixed(1)}M`;
  return `${(bytes / 1024).toFixed(0)}K`;
}

/** Renders a minimal inline sparkline using SVG. */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const max  = Math.max(...values, 1);
  const w    = 80;
  const h    = 24;
  const step = w / (values.length - 1);
  const pts  = values
    .map((v, i) => `${i * step},${h - (v / max) * h}`)
    .join(" ");

  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function AgentHealthWidget({
  deploymentId,
  heartbeats,
  driftCount,
}: AgentHealthWidgetProps) {
  const latest   = heartbeats.at(-1);
  const cpuSpark = heartbeats.map((h) => h.cpu_pct);
  const memSpark = heartbeats.map((h) => h.mem_bytes / (1024 * 1024)); // MB
  const hasDrift = driftCount > 0;

  return (
    <div
      className={`border ${hasDrift ? "border-red-800" : "border-zinc-800"} bg-zinc-950 p-3`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Activity size={14} className={hasDrift ? "text-red-400" : "text-zinc-400"} />
        <span className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">
          Agent Health
        </span>
        {hasDrift ? (
          <span className="ml-auto flex items-center gap-1 text-xs text-red-400 font-semibold">
            <AlertTriangle size={11} />
            DRIFT ×{driftCount}
          </span>
        ) : (
          <CheckCircle size={12} className="ml-auto text-green-500" />
        )}
      </div>

      {/* Current stats */}
      {latest ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-2">
          <span className="text-zinc-500">CPU</span>
          <span className="font-mono text-zinc-300">{latest.cpu_pct.toFixed(1)}%</span>
          <span className="text-zinc-500">Memory</span>
          <span className="font-mono text-zinc-300">{formatBytes(latest.mem_bytes)}</span>
          <span className="text-zinc-500">Hash</span>
          <span className="font-mono text-zinc-500 truncate">
            {latest.artifact_hash.slice(0, 12)}…
          </span>
        </div>
      ) : (
        <p className="text-xs text-zinc-600 text-center py-1">No data</p>
      )}

      {/* Sparklines */}
      {heartbeats.length >= 2 && (
        <div className="flex gap-4 mt-1">
          <div>
            <p className="text-[10px] text-zinc-600 mb-px">CPU %</p>
            <Sparkline values={cpuSpark} color="#f59e0b" />
          </div>
          <div>
            <p className="text-[10px] text-zinc-600 mb-px">Mem MB</p>
            <Sparkline values={memSpark} color="#6366f1" />
          </div>
        </div>
      )}

      {/* Deployment ID */}
      <p className="font-mono text-[10px] text-zinc-700 mt-2 truncate">
        {deploymentId}
      </p>
    </div>
  );
}
