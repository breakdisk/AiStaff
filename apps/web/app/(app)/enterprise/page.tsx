"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Building2, Users, HeadphonesIcon, ChevronRight, TrendingUp, Zap, Shield, Loader2, Mail,
} from "lucide-react";
import { getMyOrg, getOrgAnalytics, listMembers, OrgResponse, OrgAnalytics, OrgMember } from "@/lib/enterpriseApi";

type SupportTier = "GROWTH" | "ENTERPRISE" | "PLATINUM";
type SlaHealth = "ON-TRACK" | "AT-RISK" | "BREACHED";
interface KpiData { label: string; target: string; actual: string; health: SlaHealth; }

function healthStyle(h: SlaHealth) {
  if (h === "ON-TRACK") return { border: "border-green-800", text: "text-green-400", bg: "bg-green-950/30" };
  if (h === "AT-RISK")  return { border: "border-amber-800", text: "text-amber-400", bg: "bg-amber-950/30" };
  return                       { border: "border-red-900",   text: "text-red-400",   bg: "bg-red-950/30"   };
}

function SupportTierBadge({ tier }: { tier: SupportTier }) {
  const style =
    tier === "PLATINUM"   ? "border-violet-800 text-violet-400 bg-violet-950/30" :
    tier === "ENTERPRISE" ? "border-amber-800 text-amber-400 bg-amber-950/30" :
                            "border-zinc-700 text-zinc-400 bg-zinc-900";
  const label =
    tier === "PLATINUM" ? "★ PLATINUM" : tier === "ENTERPRISE" ? "● ENTERPRISE" : "● GROWTH";
  return <span className={`font-mono text-[10px] px-2 py-0.5 rounded-sm border ${style}`}>{label}</span>;
}

function KpiTile({ kpi }: { kpi: KpiData }) {
  const s = healthStyle(kpi.health);
  return (
    <div className={`border rounded-sm p-3 space-y-1.5 ${s.border} ${s.bg}`}>
      <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{kpi.label}</p>
      <p className={`font-mono text-xl font-medium tabular-nums ${s.text}`}>{kpi.actual}</p>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] text-zinc-600">Target: {kpi.target}</span>
        <span className={`font-mono text-[9px] px-1 py-0.5 rounded-sm border ${s.border} ${s.text}`}>{kpi.health}</span>
      </div>
    </div>
  );
}

export default function EnterpriseDashboard() {
  const { data: session } = useSession();
  const router = useRouter();
  const profileId = (session?.user as { profileId?: string })?.profileId;

  const [org, setOrg]         = useState<OrgResponse | null>(null);
  const [analytics, setAnalytics] = useState<OrgAnalytics | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [noOrg, setNoOrg]     = useState(false);

  useEffect(() => {
    if (!profileId) return;
    getMyOrg(profileId)
      .then(org => {
        setOrg(org);
        return Promise.all([
          getOrgAnalytics(org.id).catch(() => null),
          listMembers(org.id).catch(() => [] as OrgMember[]),
        ]);
      })
      .then(([a, m]) => {
        if (a) setAnalytics(a);
        setMembers(m as OrgMember[]);
      })
      .catch(() => setNoOrg(true))
      .finally(() => setLoading(false));
  }, [profileId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-amber-400" size={20} />
      </div>
    );
  }

  if (noOrg || !org) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <Building2 className="mx-auto text-zinc-600" size={32} />
          <p className="text-sm text-zinc-400">You don&apos;t have an organisation yet.</p>
          <button
            onClick={() => router.push("/enterprise/setup")}
            className="px-4 py-2 bg-amber-400 text-zinc-950 text-sm font-medium rounded-sm hover:bg-amber-300"
          >
            Create organisation
          </button>
        </div>
      </div>
    );
  }

  const kpis: KpiData[] = [
    { label: "Active Deployments", target: "—", actual: String(analytics?.active_deployments ?? 0), health: "ON-TRACK" },
    {
      label: "DoD Pass Rate", target: "95%",
      actual: `${analytics?.avg_dod_pass_rate ?? 0}%`,
      health: (analytics?.avg_dod_pass_rate ?? 0) >= 95 ? "ON-TRACK" : (analytics?.avg_dod_pass_rate ?? 0) >= 80 ? "AT-RISK" : "BREACHED",
    },
    {
      label: "Drift (30d)", target: "0",
      actual: String(analytics?.drift_incidents_30d ?? 0),
      health: (analytics?.drift_incidents_30d ?? 0) === 0 ? "ON-TRACK" : (analytics?.drift_incidents_30d ?? 0) <= 2 ? "AT-RISK" : "BREACHED",
    },
    { label: "Total Spend", target: "—", actual: `$${((analytics?.total_spend_cents ?? 0) / 100).toLocaleString()}`, health: "ON-TRACK" },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Building2 className="text-amber-400" size={16} />
              <h1 className="text-base font-semibold">{org.name}</h1>
              <SupportTierBadge tier={org.plan_tier} />
            </div>
            <p className="text-xs text-zinc-500">
              {org.member_count} member{org.member_count !== 1 ? "s" : ""} ·
              Contract: {org.contract_value_cents > 0 ? `$${(org.contract_value_cents / 100).toLocaleString()} / yr` : "—"} ·
              {org.renewal_date ? ` Renews ${org.renewal_date}` : " No renewal date set"}
            </p>
          </div>
          <a href="/enterprise/members" className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300">
            Manage team <ChevronRight size={12} />
          </a>
        </div>

        <div>
          <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-3">SLA Health</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {kpis.map(k => <KpiTile key={k.label} kpi={k} />)}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-widest">Team</h2>
            <a href="/enterprise/members" className="text-xs text-amber-400 hover:text-amber-300">View all</a>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm divide-y divide-zinc-800">
            {members.slice(0, 5).map(m => (
              <div key={m.profile_id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="w-7 h-7 rounded-sm bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                  <span className="font-mono text-xs text-zinc-300">{m.display_name[0]?.toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-200 truncate">{m.display_name}</p>
                  <p className="text-[10px] text-zinc-500">{m.member_role}</p>
                </div>
                <span className={`font-mono text-[10px] ${
                  m.identity_tier === "BIOMETRIC_VERIFIED" ? "text-emerald-400" :
                  m.identity_tier === "SOCIAL_VERIFIED"    ? "text-sky-400" : "text-zinc-500"
                }`}>
                  T{m.identity_tier === "BIOMETRIC_VERIFIED" ? 2 : m.identity_tier === "SOCIAL_VERIFIED" ? 1 : 0}
                </span>
              </div>
            ))}
            {members.length === 0 && <p className="px-4 py-3 text-xs text-zinc-500">No members yet.</p>}
          </div>
        </div>

        {org.csm_name && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-zinc-50">Dedicated Success Manager</p>
                <p className="text-xs text-zinc-400">{org.csm_name}</p>
                {org.csm_email && <p className="font-mono text-[10px] text-zinc-500">{org.csm_email}</p>}
                {org.csm_response_sla && <p className="text-[10px] text-zinc-500">SLA: {org.csm_response_sla}</p>}
              </div>
              <HeadphonesIcon className="text-amber-400 flex-shrink-0" size={16} />
            </div>
            {org.csm_email && (
              <a href={`mailto:${org.csm_email}`} className="mt-3 flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300">
                <Mail size={12} /> Escalate to CSM
              </a>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {[
            { href: "/enterprise/members", label: "Team & Invites", icon: Users },
            { href: "/enterprise/api-keys", label: "API Keys", icon: Shield },
            { href: "/enterprise/sla", label: "SLA Dashboard", icon: TrendingUp },
            { href: "/admin/deployments", label: "Deployments", icon: Zap },
          ].map(({ href, label, icon: Icon }) => (
            <a key={href} href={href}
              className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-sm px-4 py-3 text-sm text-zinc-300 hover:border-zinc-700 hover:text-zinc-50"
            >
              <Icon size={14} className="text-amber-400" /> {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
