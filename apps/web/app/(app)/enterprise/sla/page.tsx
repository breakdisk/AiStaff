"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  TrendingUp, ChevronLeft, AlertTriangle, CheckCircle2,
  Clock, DollarSign, Users, ShieldCheck, Activity, Zap,
} from "lucide-react";
import {
  getMyOrg, getOrgAnalytics, listOrgDeployments, listMembers,
  OrgResponse, OrgAnalytics, OrgDeployment, OrgMember,
} from "@/lib/enterpriseApi";

// ── Types ─────────────────────────────────────────────────────────────────────

type Health = "ON-TRACK" | "AT-RISK" | "BREACHED";

interface KpiData {
  label: string;
  value: string;
  sub: string;
  health: Health;
  icon: React.ReactNode;
}

interface WeekBucket { label: string; count: number; spend: number; }

interface Incident {
  id: string;
  title: string;
  status: string;
  amount: number;
  date: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function healthClasses(h: Health) {
  if (h === "ON-TRACK") return { border: "border-emerald-800", text: "text-emerald-400", badge: "bg-emerald-950/40 border-emerald-800 text-emerald-400" };
  if (h === "AT-RISK")  return { border: "border-amber-800",   text: "text-amber-400",   badge: "bg-amber-950/40  border-amber-800  text-amber-400"   };
  return                       { border: "border-red-900",     text: "text-red-400",     badge: "bg-red-950/40    border-red-900    text-red-400"     };
}

function statusColor(s: string): string {
  if (s === "RELEASED")           return "text-emerald-400 bg-emerald-950/40 border-emerald-800";
  if (s === "VETO_WINDOW")        return "text-amber-400   bg-amber-950/40   border-amber-800";
  if (s === "BIOMETRIC_PENDING")  return "text-amber-400   bg-amber-950/40   border-amber-800";
  if (s === "VETOED")             return "text-red-400     bg-red-950/40     border-red-900";
  if (s === "FAILED")             return "text-red-400     bg-red-950/40     border-red-900";
  return "text-zinc-400 bg-zinc-800 border-zinc-700";
}

function cents(n: number): string {
  return `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(n: number): string { return `${n.toFixed(1)}%`; }

/** Group deployments into last 4 ISO-week buckets */
function weekBuckets(deps: OrgDeployment[]): WeekBucket[] {
  const now   = Date.now();
  const MS7   = 7 * 24 * 60 * 60 * 1000;
  const buckets: WeekBucket[] = Array.from({ length: 4 }, (_, i) => {
    const start = new Date(now - (3 - i) * MS7);
    return {
      label: start.toLocaleDateString("en-GB", { month: "short", day: "numeric" }),
      count: 0,
      spend: 0,
    };
  });

  for (const d of deps) {
    const t    = new Date(d.created_at).getTime();
    const ago  = now - t;
    const idx  = 3 - Math.floor(ago / MS7);
    if (idx >= 0 && idx < 4) {
      buckets[idx].count++;
      buckets[idx].spend += d.escrow_amount_cents;
    }
  }
  return buckets;
}

// ── KPI builder ───────────────────────────────────────────────────────────────

function buildKpis(
  a:       OrgAnalytics,
  deps:    OrgDeployment[],
  members: OrgMember[],
): KpiData[] {
  const total   = deps.length || 1;
  const vetoed  = deps.filter(d => d.status === "VETOED").length;
  const pending = deps.filter(d => d.status === "VETO_WINDOW")
                      .reduce((s, d) => s + d.escrow_amount_cents, 0);
  const vetoRate  = (vetoed / total) * 100;
  const avgTrust  = members.length
    ? members.reduce((s, m) => s + m.trust_score, 0) / members.length
    : 0;

  return [
    {
      label: "Total Deployments",
      value: String(a.total_deployments),
      sub: `${a.active_deployments} active`,
      health: "ON-TRACK",
      icon: <Activity size={14} />,
    },
    {
      label: "DoD Pass Rate",
      value: pct(a.avg_dod_pass_rate),
      sub: "Target ≥ 95%",
      health: a.avg_dod_pass_rate >= 95 ? "ON-TRACK" : a.avg_dod_pass_rate >= 80 ? "AT-RISK" : "BREACHED",
      icon: <CheckCircle2 size={14} />,
    },
    {
      label: "Veto Rate",
      value: pct(vetoRate),
      sub: `${vetoed} vetoed of ${deps.length}`,
      health: vetoRate <= 5 ? "ON-TRACK" : vetoRate <= 15 ? "AT-RISK" : "BREACHED",
      icon: <AlertTriangle size={14} />,
    },
    {
      label: "Drift Incidents (30d)",
      value: String(a.drift_incidents_30d),
      sub: "Target: 0",
      health: a.drift_incidents_30d === 0 ? "ON-TRACK" : a.drift_incidents_30d <= 2 ? "AT-RISK" : "BREACHED",
      icon: <Zap size={14} />,
    },
    {
      label: "Pending Escrow",
      value: cents(pending),
      sub: "Awaiting veto window",
      health: "ON-TRACK",
      icon: <Clock size={14} />,
    },
    {
      label: "Total Spend",
      value: cents(a.total_spend_cents),
      sub: "All-time escrow",
      health: "ON-TRACK",
      icon: <DollarSign size={14} />,
    },
    {
      label: "Avg Team Trust Score",
      value: avgTrust.toFixed(0),
      sub: `${members.length} members`,
      health: avgTrust >= 60 ? "ON-TRACK" : avgTrust >= 40 ? "AT-RISK" : "BREACHED",
      icon: <ShieldCheck size={14} />,
    },
    {
      label: "Team Size",
      value: String(members.length),
      sub: `${members.filter(m => m.member_role === "ADMIN").length} admin`,
      health: "ON-TRACK",
      icon: <Users size={14} />,
    },
  ];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiTile({ kpi }: { kpi: KpiData }) {
  const c = healthClasses(kpi.health);
  return (
    <div className={`border rounded-sm p-4 space-y-2.5 bg-zinc-900/40 ${c.border}`}>
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{kpi.label}</p>
        <span className={c.text}>{kpi.icon}</span>
      </div>
      <p className={`font-mono text-2xl font-medium tabular-nums ${c.text}`}>{kpi.value}</p>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] text-zinc-600">{kpi.sub}</span>
        <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded-sm border ${c.badge}`}>
          {kpi.health}
        </span>
      </div>
    </div>
  );
}

function WeeklyChart({ buckets }: { buckets: WeekBucket[] }) {
  const maxCount = Math.max(...buckets.map(b => b.count), 1);
  return (
    <div className="border border-zinc-800 rounded-sm p-4 bg-zinc-900/40 space-y-3">
      <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
        Deployments — last 4 weeks
      </p>
      <div className="flex items-end gap-3 h-24">
        {buckets.map(b => (
          <div key={b.label} className="flex-1 flex flex-col items-center gap-1.5">
            <span className="font-mono text-[9px] text-zinc-500">{b.count}</span>
            <div className="w-full bg-zinc-800 rounded-sm overflow-hidden" style={{ height: "64px" }}>
              <div
                className="w-full bg-amber-400/70 rounded-sm transition-all duration-500"
                style={{ height: `${(b.count / maxCount) * 100}%`, marginTop: "auto" }}
              />
            </div>
            <span className="font-mono text-[9px] text-zinc-600">{b.label}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-4 pt-1 border-t border-zinc-800">
        {buckets.map(b => (
          <div key={b.label} className="flex-1">
            <p className="font-mono text-[9px] text-zinc-600">Spend</p>
            <p className="font-mono text-[10px] text-zinc-400">{cents(b.spend)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBreakdown({ deps }: { deps: OrgDeployment[] }) {
  const total = deps.length || 1;
  const groups: Record<string, number> = {};
  for (const d of deps) groups[d.status] = (groups[d.status] ?? 0) + 1;

  const order = ["RELEASED", "VETO_WINDOW", "BIOMETRIC_PENDING", "DEPLOYMENT_STARTED", "VETOED", "FAILED"];
  const entries = order
    .filter(s => groups[s])
    .map(s => ({ status: s, count: groups[s] }));

  // Add any unknown statuses
  for (const [s, n] of Object.entries(groups)) {
    if (!order.includes(s)) entries.push({ status: s, count: n });
  }

  return (
    <div className="border border-zinc-800 rounded-sm p-4 bg-zinc-900/40 space-y-3">
      <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
        Deployment Status Breakdown
      </p>
      <div className="space-y-2">
        {entries.map(({ status, count }) => (
          <div key={status} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded-sm border ${statusColor(status)}`}>
                {status}
              </span>
              <span className="font-mono text-[10px] text-zinc-500">
                {count} · {pct((count / total) * 100)}
              </span>
            </div>
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  status === "RELEASED"          ? "bg-emerald-500" :
                  status === "VETOED"            ? "bg-red-500"     :
                  status === "FAILED"            ? "bg-red-700"     :
                  "bg-amber-400"
                }`}
                style={{ width: `${(count / total) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IncidentTable({ deps }: { deps: OrgDeployment[] }) {
  const incidents: Incident[] = deps
    .filter(d => d.status === "VETOED" || d.status === "FAILED")
    .slice(0, 10)
    .map(d => ({
      id:     d.id,
      title:  d.listing_title ?? d.deployment_type,
      status: d.status,
      amount: d.escrow_amount_cents,
      date:   new Date(d.created_at).toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
      }),
    }));

  if (incidents.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-sm p-6 bg-zinc-900/40 text-center">
        <CheckCircle2 className="text-emerald-400 mx-auto mb-2" size={18} />
        <p className="font-mono text-xs text-zinc-500">No incidents — all deployments healthy</p>
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
          Recent Incidents (Vetoed / Failed)
        </p>
      </div>
      <div className="divide-y divide-zinc-800/60">
        {incidents.map(inc => (
          <div key={inc.id} className="flex items-center gap-4 px-4 py-2.5">
            <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded-sm border flex-shrink-0 ${statusColor(inc.status)}`}>
              {inc.status}
            </span>
            <span className="font-mono text-xs text-zinc-300 flex-1 truncate">{inc.title}</span>
            <span className="font-mono text-[10px] text-zinc-500 flex-shrink-0">{cents(inc.amount)}</span>
            <span className="font-mono text-[10px] text-zinc-600 flex-shrink-0">{inc.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CsmCard({ org }: { org: OrgResponse }) {
  if (!org.csm_name && !org.csm_email) return null;
  return (
    <div className="border border-zinc-800 rounded-sm p-4 bg-zinc-900/40 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 space-y-0.5">
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Customer Success Manager</p>
        <p className="font-mono text-sm text-zinc-200">{org.csm_name ?? "—"}</p>
        {org.csm_email && (
          <a href={`mailto:${org.csm_email}`} className="font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors">
            {org.csm_email}
          </a>
        )}
      </div>
      {org.csm_response_sla && (
        <div className="text-right">
          <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Response SLA</p>
          <p className="font-mono text-sm text-zinc-300">{org.csm_response_sla}</p>
        </div>
      )}
      {org.renewal_date && (
        <div className="text-right sm:ml-6">
          <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Renewal</p>
          <p className="font-mono text-sm text-zinc-300">
            {new Date(org.renewal_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EnterpriseSla() {
  const { data: session } = useSession();
  const profileId = (session?.user as { profileId?: string })?.profileId;

  const [org,     setOrg]     = useState<OrgResponse | null>(null);
  const [kpis,    setKpis]    = useState<KpiData[]>([]);
  const [buckets, setBuckets] = useState<WeekBucket[]>([]);
  const [deps,    setDeps]    = useState<OrgDeployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    if (!profileId) return;

    getMyOrg(profileId)
      .then(async o => {
        setOrg(o);
        const [analytics, deployments, members] = await Promise.all([
          getOrgAnalytics(o.id),
          listOrgDeployments(o.id),
          listMembers(o.id),
        ]);
        setKpis(buildKpis(analytics, deployments, members));
        setBuckets(weekBuckets(deployments));
        setDeps(deployments);
      })
      .catch(e => setError(e.message ?? "Failed to load SLA data"))
      .finally(() => setLoading(false));
  }, [profileId]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-6">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <a href="/enterprise" className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <ChevronLeft size={16} />
          </a>
          <TrendingUp className="text-amber-400" size={16} />
          <h1 className="text-base font-semibold">SLA Dashboard</h1>
          {org && (
            <span className="ml-auto font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
              {org.name} · {org.plan_tier}
            </span>
          )}
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="border border-red-900 bg-red-950/30 rounded-sm px-4 py-3 font-mono text-xs text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* KPI grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {kpis.map(k => <KpiTile key={k.label} kpi={k} />)}
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <WeeklyChart buckets={buckets} />
              <StatusBreakdown deps={deps} />
            </div>

            {/* Incident log */}
            <IncidentTable deps={deps} />

            {/* CSM card */}
            {org && <CsmCard org={org} />}
          </>
        )}
      </div>
    </div>
  );
}
