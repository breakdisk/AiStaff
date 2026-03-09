"use client";

import { useState } from "react";
import {
  Building2, Shield, Users, HeadphonesIcon, AlertTriangle,
  CheckCircle, ChevronRight, Clock, TrendingUp, Zap, Mail, Calendar,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type SupportTier = "Gold" | "Platinum";
type SlaHealth   = "ON-TRACK" | "AT-RISK" | "BREACHED";

interface KpiData {
  label:    string;
  target:   string;
  actual:   string;
  health:   SlaHealth;
}

interface MiniTalent {
  id:         string;
  name:       string;
  trustTier:  number;
  skills:     string[];
  matchScore: number;
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const ORG = {
  name:           "Acme Financial Group",
  tier:           "Platinum" as SupportTier,
  contractValue:  "$340,000 / yr",
  renewalDate:    "2027-03-01",
  activeDeployments: 8,
  talentPoolSize:    23,
  csmName:           "Jordan Lee",
  csmEmail:          "j.lee@aistaff.app",
  csmResponseSla:    "< 1 hr",
};

const SLA_KPIS: KpiData[] = [
  { label: "Deployment Uptime",  target: "99.5%", actual: "99.8%", health: "ON-TRACK" },
  { label: "Avg Deploy Time",    target: "< 24 hr",actual: "18.4 hr", health: "ON-TRACK" },
  { label: "DoD Pass Rate",      target: "95%",   actual: "87%",   health: "AT-RISK"  },
  { label: "Drift Incidents",    target: "0 / 30d",actual: "2",    health: "BREACHED" },
];

const MINI_TALENT: MiniTalent[] = [
  { id: "t-01", name: "Alexei V.", trustTier: 2, skills: ["rust", "wasm", "kafka"], matchScore: 0.92 },
  { id: "t-02", name: "Priya M.",  trustTier: 2, skills: ["rust", "kafka"],         matchScore: 0.87 },
  { id: "t-03", name: "Omar K.",   trustTier: 1, skills: ["wasm", "python"],         matchScore: 0.81 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function healthStyle(h: SlaHealth) {
  if (h === "ON-TRACK") return { border: "border-green-800",  text: "text-green-400",  bg: "bg-green-950/30"  };
  if (h === "AT-RISK")  return { border: "border-amber-800",  text: "text-amber-400",  bg: "bg-amber-950/30"  };
  return                       { border: "border-red-900",    text: "text-red-400",    bg: "bg-red-950/30"    };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SupportTierBadge({ tier }: { tier: SupportTier }) {
  const style = tier === "Platinum"
    ? "border-violet-800 text-violet-400 bg-violet-950/30"
    : "border-amber-800 text-amber-400 bg-amber-950/30";
  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded-sm border ${style}`}>
      {tier === "Platinum" ? "★ PLATINUM" : "● GOLD"}
    </span>
  );
}

function KpiTile({ kpi }: { kpi: KpiData }) {
  const s = healthStyle(kpi.health);
  return (
    <div className={`border rounded-sm p-3 space-y-1.5 ${s.border} ${s.bg}`}>
      <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{kpi.label}</p>
      <p className={`font-mono text-xl font-medium tabular-nums ${s.text}`}>{kpi.actual}</p>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] text-zinc-600">Target: {kpi.target}</span>
        <span className={`font-mono text-[9px] px-1 py-0.5 rounded-sm border ${s.border} ${s.text}`}>
          {kpi.health}
        </span>
      </div>
    </div>
  );
}

function MiniTalentRow({ t }: { t: MiniTalent }) {
  const pct = Math.round(t.matchScore * 100);
  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-zinc-800 last:border-0">
      <div className="w-7 h-7 rounded-sm bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
        <span className="font-mono text-xs text-zinc-300">{t.name[0]}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-mono text-xs text-zinc-200 truncate">{t.name}</p>
          <span className="font-mono text-[9px] px-1 rounded-sm border border-zinc-700 text-zinc-500 flex-shrink-0">
            T{t.trustTier}
          </span>
        </div>
        <div className="flex flex-wrap gap-1 mt-0.5">
          {t.skills.map((s) => (
            <span key={s} className="font-mono text-[9px] text-zinc-600 bg-zinc-800 px-1 rounded-sm">{s}</span>
          ))}
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        <span className="font-mono text-xs tabular-nums text-zinc-400">{pct}%</span>
        <p className="font-mono text-[9px] text-zinc-600">match</p>
      </div>
    </div>
  );
}

function CsmCard({ name, email, sla, tier }: { name: string; email: string; sla: string; tier: SupportTier }) {
  const [escalated,  setEscalated]  = useState(false);
  const [scheduled,  setScheduled]  = useState(false);

  return (
    <div className="border border-zinc-800 rounded-sm p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-sm border flex items-center justify-center flex-shrink-0 ${
          tier === "Platinum" ? "border-violet-800 bg-violet-950/30" : "border-amber-800 bg-amber-950/30"
        }`}>
          <span className={`font-mono text-sm font-medium ${tier === "Platinum" ? "text-violet-400" : "text-amber-400"}`}>
            {name[0]}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs font-medium text-zinc-200">{name}</p>
          <p className="font-mono text-[10px] text-zinc-500">Dedicated Success Manager</p>
          <div className="flex items-center gap-1 mt-1">
            <Mail className="w-2.5 h-2.5 text-zinc-600" />
            <span className="font-mono text-[10px] text-zinc-500 truncate">{email}</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-mono text-[10px] text-zinc-600">Response SLA</p>
          <p className={`font-mono text-xs font-medium ${tier === "Platinum" ? "text-violet-400" : "text-amber-400"}`}>{sla}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => { setEscalated(true); setTimeout(() => setEscalated(false), 2000); }}
          className={`h-8 rounded-sm font-mono text-xs border transition-all ${
            escalated
              ? "border-green-800 bg-green-950 text-green-400"
              : "border-red-900 text-red-400 hover:bg-red-950/30"
          }`}
        >
          {escalated ? "✓ Escalated" : "Escalate Issue"}
        </button>
        <button
          onClick={() => { setScheduled(true); setTimeout(() => setScheduled(false), 2000); }}
          className={`h-8 rounded-sm font-mono text-xs border transition-all ${
            scheduled
              ? "border-green-800 bg-green-950 text-green-400"
              : "border-zinc-700 text-zinc-400 hover:bg-zinc-900"
          }`}
        >
          {scheduled ? "✓ Scheduled" : "Schedule Call"}
        </button>
      </div>
    </div>
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
                lbl === "Enterprise Hub"
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

export default function EnterprisePage() {
  const slaBreach = SLA_KPIS.filter((k) => k.health === "BREACHED").length;
  const slaAtRisk = SLA_KPIS.filter((k) => k.health === "AT-RISK").length;

  const overallHealth: SlaHealth = slaBreach > 0 ? "BREACHED" : slaAtRisk > 0 ? "AT-RISK" : "ON-TRACK";
  const hs = healthStyle(overallHealth);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Sidebar />

      <main className="flex-1 p-4 pb-20 lg:pb-4 space-y-5 max-w-3xl mx-auto w-full">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-4 h-4 text-amber-400" />
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
              Enterprise Hub
            </h1>
          </div>
          <SupportTierBadge tier={ORG.tier} />
        </div>

        {/* ── Section A: Account Overview ── */}
        <section className="border border-zinc-800 rounded-sm p-4 space-y-3">
          <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Account Overview</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Organisation",   value: ORG.name,              wide: true  },
              { label: "Contract Value", value: ORG.contractValue,     wide: false },
              { label: "Renewal",        value: ORG.renewalDate,       wide: false },
              { label: "Active Deploys", value: String(ORG.activeDeployments), wide: false },
              { label: "Talent Pool",    value: `${ORG.talentPoolSize} members`,    wide: false },
            ].filter((_, i, a) => a.length > 0).map(({ label, value, wide }) => (
              <div key={label} className={`border border-zinc-800 rounded-sm px-3 py-2 ${wide ? "col-span-2" : ""}`}>
                <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">{label}</p>
                <p className="font-mono text-xs text-zinc-200 mt-0.5 truncate">{value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Section B: SLA Summary ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-zinc-500" />
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">SLA Summary</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded-sm border ${hs.border} ${hs.text}`}>
                {overallHealth}
              </span>
              <a href="/enterprise/sla"
                className="flex items-center gap-1 font-mono text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Full SLA Dashboard <ChevronRight className="w-3 h-3" />
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SLA_KPIS.map((k) => <KpiTile key={k.label} kpi={k} />)}
          </div>
          {slaBreach > 0 && (
            <div className="border border-red-900 bg-red-950/30 rounded-sm px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="font-mono text-xs text-red-300">
                {slaBreach} SLA metric{slaBreach > 1 ? "s are" : " is"} breached.
                Review the <a href="/enterprise/sla" className="underline">SLA Dashboard</a> and escalate with your CSM.
              </p>
            </div>
          )}
        </section>

        {/* ── Section C: Custom Talent Pool ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-zinc-500" />
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Custom Talent Pool</p>
            </div>
            <a href="/enterprise/talent-pools"
              className="flex items-center gap-1 font-mono text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Manage pool <ChevronRight className="w-3 h-3" />
            </a>
          </div>
          <div className="border border-zinc-800 rounded-sm px-3">
            {MINI_TALENT.map((t) => <MiniTalentRow key={t.id} t={t} />)}
          </div>
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] text-zinc-600">
              {ORG.talentPoolSize} approved · 4 pending review
            </p>
            <a href="/enterprise/talent-pools"
              className="flex items-center gap-1.5 font-mono text-xs text-amber-500 hover:text-amber-400 transition-colors"
            >
              <Zap className="w-3 h-3" /> Add candidate
            </a>
          </div>
        </section>

        {/* ── Section D: Support & Success ── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <HeadphonesIcon className="w-3.5 h-3.5 text-zinc-500" />
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Support & Success</p>
          </div>

          <CsmCard
            name={ORG.csmName}
            email={ORG.csmEmail}
            sla={ORG.csmResponseSla}
            tier={ORG.tier}
          />

          {/* Support tier comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { tier: "Gold" as SupportTier,     sla: "8-hr response",   perks: ["Priority queue", "Monthly review", "Dedicated email"] },
              { tier: "Platinum" as SupportTier, sla: "1-hr response",   perks: ["Priority queue", "Weekly review", "Dedicated Slack", "24/7 on-call"] },
            ].map(({ tier, sla, perks }) => {
              const active = ORG.tier === tier;
              const style  = tier === "Platinum"
                ? active ? "border-violet-700 bg-violet-950/20" : "border-zinc-800"
                : active ? "border-amber-700 bg-amber-950/20" : "border-zinc-800";
              return (
                <div key={tier} className={`border rounded-sm p-3 space-y-2 ${style}`}>
                  <div className="flex items-center justify-between">
                    <SupportTierBadge tier={tier} />
                    {active && <span className="font-mono text-[9px] text-green-400">● YOUR PLAN</span>}
                  </div>
                  <p className={`font-mono text-xs font-medium ${tier === "Platinum" ? "text-violet-400" : "text-amber-400"}`}>
                    {sla}
                  </p>
                  <ul className="space-y-1">
                    {perks.map((p) => (
                      <li key={p} className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500">
                        <CheckCircle className="w-2.5 h-2.5 text-green-600 flex-shrink-0" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

      </main>
    </div>
  );
}
