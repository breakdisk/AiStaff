"use client";

import { useState } from "react";
import {
  TrendingUp, AlertTriangle, CheckCircle, Clock, ChevronUp, ChevronDown,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type SlaHealth  = "ON-TRACK" | "AT-RISK" | "BREACHED";
type DateFilter = "7d" | "30d" | "90d";

interface SlaTile {
  label:    string;
  target:   string;
  actual:   number;
  unit:     string;
  threshold:number;   // value at which it flips to AT-RISK
  breach:   number;   // value at which it flips to BREACHED
  lowerIsBetter: boolean;
}

interface BreachEvent {
  id:       string;
  date:     string;
  metric:   string;
  target:   string;
  actual:   string;
  status:   "OPEN" | "RESOLVED";
}

interface DeploymentHealth {
  id:         string;
  project:    string;
  daysActive: number;
  uptime:     number;
  lastHb:     string;
  driftFlag:  boolean;
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const SLA_TILES: SlaTile[] = [
  { label: "Deployment Uptime",       target: "99.5%",   actual: 99.8, unit: "%",   threshold: 99.5,  breach: 99.0, lowerIsBetter: false },
  { label: "Avg Deployment Time",     target: "< 24 hr", actual: 18.4, unit: " hr", threshold: 20,    breach: 24,   lowerIsBetter: true  },
  { label: "DoD Pass Rate",           target: "95%",     actual: 87,   unit: "%",   threshold: 95,    breach: 80,   lowerIsBetter: false },
  { label: "MTTR",                    target: "< 4 hr",  actual: 6.2,  unit: " hr", threshold: 4,     breach: 8,    lowerIsBetter: true  },
  { label: "Drift Incidents (30d)",   target: "0",       actual: 2,    unit: "",    threshold: 0,     breach: 1,    lowerIsBetter: true  },
  { label: "Client Acceptance Rate",  target: "98%",     actual: 99.1, unit: "%",   threshold: 98,    breach: 95,   lowerIsBetter: false },
];

const ALL_BREACHES: BreachEvent[] = [
  { id: "b-001", date: "2026-03-07", metric: "Drift Incidents",    target: "0",       actual: "2",       status: "OPEN"     },
  { id: "b-002", date: "2026-03-06", metric: "MTTR",               target: "< 4 hr",  actual: "6.2 hr",  status: "OPEN"     },
  { id: "b-003", date: "2026-02-28", metric: "DoD Pass Rate",      target: "95%",     actual: "82%",     status: "RESOLVED" },
  { id: "b-004", date: "2026-02-18", metric: "Avg Deployment Time",target: "< 24 hr", actual: "27.1 hr", status: "RESOLVED" },
  { id: "b-005", date: "2026-01-30", metric: "Client Acceptance",  target: "98%",     actual: "94%",     status: "RESOLVED" },
];

const DEPLOYMENTS: DeploymentHealth[] = [
  { id: "dep-01J9X2Z3", project: "CRM Connector v3",    daysActive: 14, uptime: 100.0, lastHb: "2 min ago",  driftFlag: false },
  { id: "dep-02A3B4C5", project: "DataSync Agent v2.1", daysActive: 9,  uptime: 97.3,  lastHb: "31 min ago", driftFlag: true  },
  { id: "dep-03C5D6E7", project: "ML Pipeline Agent",   daysActive: 5,  uptime: 99.8,  lastHb: "1 min ago",  driftFlag: false },
  { id: "dep-04E7F8G9", project: "RoboArm Controller",  daysActive: 21, uptime: 99.9,  lastHb: "4 min ago",  driftFlag: false },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeHealth(tile: SlaTile): SlaHealth {
  if (tile.lowerIsBetter) {
    if (tile.actual > tile.breach)    return "BREACHED";
    if (tile.actual > tile.threshold) return "AT-RISK";
    return "ON-TRACK";
  } else {
    if (tile.actual < tile.breach)    return "BREACHED";
    if (tile.actual < tile.threshold) return "AT-RISK";
    return "ON-TRACK";
  }
}

function healthStyle(h: SlaHealth) {
  if (h === "ON-TRACK") return { border: "border-green-800",  text: "text-green-400",  bg: "bg-green-950/20"  };
  if (h === "AT-RISK")  return { border: "border-amber-800",  text: "text-amber-400",  bg: "bg-amber-950/20"  };
  return                       { border: "border-red-900",    text: "text-red-400",    bg: "bg-red-950/20"    };
}

function delta(tile: SlaTile): { pct: number; dir: "up" | "down" } {
  const diff = tile.lowerIsBetter
    ? Number(tile.target.replace(/[^0-9.]/g, "")) - tile.actual
    : tile.actual - Number(tile.target.replace(/[^0-9.]/g, ""));
  return { pct: Math.abs(diff), dir: diff >= 0 ? "up" : "down" };
}

function dateInWindow(dateStr: string, filter: DateFilter): boolean {
  const d    = new Date(dateStr);
  const days = filter === "7d" ? 7 : filter === "30d" ? 30 : 90;
  const cutoff = new Date(Date.now() - days * 86_400_000);
  return d >= cutoff;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SlaKpiTile({ tile }: { tile: SlaTile }) {
  const health = computeHealth(tile);
  const s      = healthStyle(health);
  const d      = delta(tile);

  return (
    <div className={`border rounded-sm p-3 space-y-1.5 ${s.border} ${s.bg}`}>
      <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest leading-tight">{tile.label}</p>
      <p className={`font-mono text-2xl font-medium tabular-nums ${s.text}`}>
        {tile.actual}{tile.unit}
      </p>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] text-zinc-600">Target: {tile.target}</span>
        <div className="flex items-center gap-0.5">
          {d.dir === "up"
            ? <ChevronUp   className="w-3 h-3 text-green-500" />
            : <ChevronDown className="w-3 h-3 text-red-400"   />
          }
          <span className={`font-mono text-[9px] px-1 py-0.5 rounded-sm border ${s.border} ${s.text}`}>
            {health}
          </span>
        </div>
      </div>
    </div>
  );
}

function BreachRow({ event }: { event: BreachEvent }) {
  return (
    <tr className="border-b border-zinc-900 hover:bg-zinc-900/30 transition-colors">
      <td className="py-2.5 pr-3 font-mono text-[10px] text-zinc-500">{event.date}</td>
      <td className="py-2.5 pr-3 font-mono text-xs text-zinc-300">{event.metric}</td>
      <td className="py-2.5 pr-3 font-mono text-[10px] text-zinc-500">{event.target}</td>
      <td className="py-2.5 pr-3 font-mono text-xs text-red-400">{event.actual}</td>
      <td className="py-2.5">
        {event.status === "OPEN" ? (
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm border border-red-900 text-red-400">OPEN</span>
        ) : (
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm border border-green-800 text-green-500">RESOLVED</span>
        )}
      </td>
    </tr>
  );
}

function UptimeBar({ pct }: { pct: number }) {
  const color = pct >= 99.5 ? "bg-green-500" : pct >= 98 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="font-mono text-[10px] text-zinc-500 tabular-nums w-14 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
}

function DeploymentHealthRow({ dep }: { dep: DeploymentHealth }) {
  const uptimeHealth = dep.uptime >= 99.5 ? "text-green-400" : dep.uptime >= 98 ? "text-amber-400" : "text-red-400";
  return (
    <tr className="border-b border-zinc-900 hover:bg-zinc-900/30 transition-colors">
      <td className="py-2.5 pr-3">
        <p className="font-mono text-xs text-zinc-300">{dep.project}</p>
        <p className="font-mono text-[9px] text-zinc-600">{dep.id}</p>
      </td>
      <td className="py-2.5 pr-3 font-mono text-[10px] text-zinc-500 tabular-nums">{dep.daysActive}d</td>
      <td className="py-2.5 pr-4 min-w-32">
        <UptimeBar pct={dep.uptime} />
      </td>
      <td className="py-2.5 pr-3 font-mono text-[10px] text-zinc-500">{dep.lastHb}</td>
      <td className="py-2.5">
        {dep.driftFlag ? (
          <span className="flex items-center gap-1 font-mono text-[9px] text-red-400">
            <AlertTriangle className="w-2.5 h-2.5" /> DRIFT
          </span>
        ) : (
          <span className="flex items-center gap-1 font-mono text-[9px] text-green-500">
            <CheckCircle className="w-2.5 h-2.5" /> OK
          </span>
        )}
      </td>
    </tr>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar() {
  return (
    <aside className="hidden lg:flex lg:flex-col w-56 border-r border-zinc-800 bg-zinc-950 p-4 gap-6">
      <span className="font-mono text-xs text-zinc-500 uppercase tracking-widest">AiStaffApp</span>
      <nav className="flex flex-col gap-1">
        {[
          { label: "Dashboard",   href: "/dashboard"   },
          { label: "Marketplace", href: "/marketplace" },
          { label: "Leaderboard", href: "/leaderboard" },
          { label: "Matching",    href: "/matching"    },
          { label: "Profile",     href: "/profile"     },
        ].map(({ label, href }) => (
          <a key={label} href={href}
            className="px-3 py-2 rounded-sm font-mono text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
          >{label}</a>
        ))}
      </nav>
      {[
        { label: "AI Tools",      items: [["Scoping","/scoping"],["Outcomes","/outcomes"],["Proposals","/proposals"],["Pricing Tool","/pricing-tool"],["Hybrid Match","/hybrid-match"]] },
        { label: "Payments",      items: [["Escrow","/escrow"],["Payouts","/payouts"],["Billing","/billing"],["Smart Contracts","/smart-contracts"],["Outcome Listings","/outcome-listings"],["Pricing Calculator","/pricing-calculator"]] },
        { label: "Workspace",     items: [["Work Diaries","/work-diaries"],["Async Collab","/async-collab"],["Collaboration","/collab"],["Success Layer","/success-layer"],["Quality Gate","/quality-gate"]] },
        { label: "Legal",         items: [["Legal Toolkit","/legal-toolkit"],["Tax Engine","/tax-engine"],["Reputation","/reputation-export"],["Transparency","/transparency"]] },
        { label: "Notifications", items: [["Alerts","/notifications"],["Reminders","/reminders"],["Settings","/notification-settings"]] },
        { label: "Enterprise",    items: [["Industry Suites","/vertical"],["Enterprise Hub","/enterprise"],["Talent Pools","/enterprise/talent-pools"],["SLA Dashboard","/enterprise/sla"],["Global & Access","/global"]] },
      ].map(({ label, items }) => (
        <div key={label} className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-700 uppercase tracking-widest px-3">{label}</p>
          {items.map(([lbl, href]) => (
            <a key={lbl} href={href}
              className={`block px-3 py-1.5 rounded-sm font-mono text-xs transition-colors ${
                lbl === "SLA Dashboard"
                  ? "text-zinc-100 bg-zinc-800"
                  : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >{lbl}</a>
          ))}
        </div>
      ))}
    </aside>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SlaPage() {
  const [dateFilter, setDateFilter] = useState<DateFilter>("30d");

  const tilesWithHealth = SLA_TILES.map((t) => ({ ...t, health: computeHealth(t) }));
  const breached = tilesWithHealth.filter((t) => t.health === "BREACHED").length;
  const atRisk   = tilesWithHealth.filter((t) => t.health === "AT-RISK").length;
  const overallHealth: "BREACHED" | "AT-RISK" | "ON-TRACK" =
    breached > 0 ? "BREACHED" : atRisk > 0 ? "AT-RISK" : "ON-TRACK";
  const hs = healthStyle(overallHealth);

  const score = Math.round(
    (tilesWithHealth.filter((t) => t.health === "ON-TRACK").length / tilesWithHealth.length) * 100
  );

  const filteredBreaches = ALL_BREACHES.filter((b) => dateInWindow(b.date, dateFilter));

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Sidebar />

      <main className="flex-1 p-4 pb-20 lg:pb-4 space-y-5 max-w-3xl mx-auto w-full">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
              SLA Dashboard
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-mono text-xl font-medium tabular-nums ${hs.text}`}>{score}</span>
            <span className="font-mono text-[10px] text-zinc-600">/ 100</span>
            <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded-sm border ${hs.border} ${hs.text}`}>
              {overallHealth}
            </span>
          </div>
        </div>

        {/* Contract period */}
        <div className="flex items-center gap-3 font-mono text-[10px] text-zinc-600">
          <Clock className="w-3 h-3" />
          <span>Contract period: 2026-03-01 → 2027-03-01</span>
          <span className="text-zinc-700">·</span>
          <span>{breached} breach{breached !== 1 ? "es" : ""} · {atRisk} at-risk</span>
        </div>

        {/* ── Section A: 6 KPI Tiles ── */}
        <section className="space-y-2">
          <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">SLA Metrics</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SLA_TILES.map((t) => <SlaKpiTile key={t.label} tile={t} />)}
          </div>
        </section>

        {/* ── Section B: Breach Log ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Breach Log</p>
            <div className="flex items-center gap-1">
              {(["7d", "30d", "90d"] as DateFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setDateFilter(f)}
                  className={`font-mono text-[10px] px-2 py-1 rounded-sm border transition-colors ${
                    dateFilter === f
                      ? "border-amber-800 text-amber-400 bg-amber-950/30"
                      : "border-zinc-700 text-zinc-500 hover:border-zinc-600"
                  }`}
                >{f}</button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left pb-2 font-mono text-[9px] text-zinc-600 uppercase tracking-widest pr-3">Date</th>
                  <th className="text-left pb-2 font-mono text-[9px] text-zinc-600 uppercase tracking-widest pr-3">Metric</th>
                  <th className="text-left pb-2 font-mono text-[9px] text-zinc-600 uppercase tracking-widest pr-3">Target</th>
                  <th className="text-left pb-2 font-mono text-[9px] text-zinc-600 uppercase tracking-widest pr-3">Actual</th>
                  <th className="text-left pb-2 font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredBreaches.length === 0 ? (
                  <tr><td colSpan={5} className="py-6 text-center font-mono text-xs text-zinc-600">No breaches in this period</td></tr>
                ) : (
                  filteredBreaches.map((b) => <BreachRow key={b.id} event={b} />)
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Section C: Deployment Health ── */}
        <section className="space-y-3">
          <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Deployment Health</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left pb-2 font-mono text-[9px] text-zinc-600 uppercase tracking-widest pr-3">Deployment</th>
                  <th className="text-left pb-2 font-mono text-[9px] text-zinc-600 uppercase tracking-widest pr-3">Age</th>
                  <th className="text-left pb-2 font-mono text-[9px] text-zinc-600 uppercase tracking-widest pr-4">Uptime</th>
                  <th className="text-left pb-2 font-mono text-[9px] text-zinc-600 uppercase tracking-widest pr-3">Last HB</th>
                  <th className="text-left pb-2 font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Drift</th>
                </tr>
              </thead>
              <tbody>
                {DEPLOYMENTS.map((d) => <DeploymentHealthRow key={d.id} dep={d} />)}
              </tbody>
            </table>
          </div>
        </section>

      </main>
    </div>
  );
}
