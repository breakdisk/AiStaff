"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { TrendingUp, Loader2, ChevronLeft } from "lucide-react";
import { getMyOrg, getOrgAnalytics, OrgAnalytics } from "@/lib/enterpriseApi";

type SlaHealth = "ON-TRACK" | "AT-RISK" | "BREACHED";
interface KpiData { label: string; target: string; actual: string; health: SlaHealth; }

function healthStyle(h: SlaHealth) {
  if (h === "ON-TRACK") return { border: "border-green-800", text: "text-green-400", bg: "bg-green-950/30" };
  if (h === "AT-RISK")  return { border: "border-amber-800", text: "text-amber-400", bg: "bg-amber-950/30" };
  return                       { border: "border-red-900",   text: "text-red-400",   bg: "bg-red-950/30"   };
}

function KpiTile({ kpi }: { kpi: KpiData }) {
  const s = healthStyle(kpi.health);
  return (
    <div className={`border rounded-sm p-4 space-y-2 ${s.border} ${s.bg}`}>
      <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{kpi.label}</p>
      <p className={`font-mono text-2xl font-medium tabular-nums ${s.text}`}>{kpi.actual}</p>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] text-zinc-600">Target: {kpi.target}</span>
        <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded-sm border ${s.border} ${s.text}`}>{kpi.health}</span>
      </div>
    </div>
  );
}

function buildKpis(a: OrgAnalytics): KpiData[] {
  return [
    { label: "Total Deployments", target: "—", actual: String(a.total_deployments), health: "ON-TRACK" },
    { label: "Active Deployments", target: "—", actual: String(a.active_deployments), health: "ON-TRACK" },
    {
      label: "DoD Pass Rate", target: "95%", actual: `${a.avg_dod_pass_rate}%`,
      health: a.avg_dod_pass_rate >= 95 ? "ON-TRACK" : a.avg_dod_pass_rate >= 80 ? "AT-RISK" : "BREACHED",
    },
    {
      label: "Drift Incidents (30d)", target: "0", actual: String(a.drift_incidents_30d),
      health: a.drift_incidents_30d === 0 ? "ON-TRACK" : a.drift_incidents_30d <= 2 ? "AT-RISK" : "BREACHED",
    },
    { label: "Total Spend", target: "—", actual: `$${(a.total_spend_cents / 100).toLocaleString()}`, health: "ON-TRACK" },
  ];
}

export default function EnterpriseSla() {
  const { data: session } = useSession();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  const [kpis, setKpis]       = useState<KpiData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profileId) return;
    getMyOrg(profileId)
      .then(org => getOrgAnalytics(org.id))
      .then(a => setKpis(buildKpis(a)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profileId]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <a href="/enterprise" className="text-zinc-500 hover:text-zinc-300"><ChevronLeft size={16} /></a>
          <TrendingUp className="text-amber-400" size={16} />
          <h1 className="text-base font-semibold">SLA Dashboard</h1>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-amber-400" size={20} /></div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {kpis.map(k => <KpiTile key={k.label} kpi={k} />)}
          </div>
        )}
      </div>
    </div>
  );
}
