"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Bot, Star, TrendingUp, Rocket,
  CheckCircle2, Clock, Shield,
} from "lucide-react";
import type { Session }               from "@/lib/session";
import { VettingBadge }              from "@/components/VettingBadge";
import { VerifiedSkillsChips }       from "@/components/VerifiedSkillsChips";
import { TrustScoreBadge }           from "@/components/TrustScoreBadge";
import type { PlatformSignal, SkillTag } from "@/components/VerifiedSkillsChips";

// ── Demo data by email ─────────────────────────────────────────────────────────

const DEMO_SIGNALS: Record<string, PlatformSignal[]> = {
  "client@demo.com": [
    { id: "gh", platform: "github",  label: "GitHub",  detail: "18 public repos · member since 2021", url: "#", verified: true },
    { id: "li", platform: "linkedin", label: "LinkedIn", detail: "Product Manager · Acme Corp",        url: "#", verified: true },
  ],
  "talent@demo.com": [
    { id: "gh",   platform: "github",        label: "GitHub",               detail: "92 public repos · member since 2019",    url: "#", verified: true },
    { id: "li",   platform: "linkedin",      label: "LinkedIn",             detail: "Senior Rust Engineer · remote",          url: "#", verified: true },
    { id: "cert", platform: "certification", label: "Wasm Systems Cert",    detail: "Bytecode Alliance · 2025",               verified: true },
  ],
  "dev@demo.com": [
    { id: "gh",  platform: "github",  label: "GitHub",  detail: "134 public repos · member since 2018", url: "#", verified: true },
    { id: "li",  platform: "linkedin", label: "LinkedIn", detail: "Staff Engineer · self-employed",       url: "#", verified: true },
    { id: "fig", platform: "figma",   label: "Figma",   detail: "Portfolio: 4 published systems",         url: "#", verified: false },
  ],
};

const DEMO_SKILLS: Record<string, SkillTag[]> = {
  "client@demo.com": [
    { tag: "product",   proficiency: 4, verified: true  },
    { tag: "analytics", proficiency: 3, verified: false },
  ],
  "talent@demo.com": [
    { tag: "rust",   proficiency: 5, verified: true  },
    { tag: "wasm",   proficiency: 5, verified: true  },
    { tag: "kafka",  proficiency: 4, verified: true  },
    { tag: "python", proficiency: 3, verified: false },
  ],
  "dev@demo.com": [
    { tag: "rust",   proficiency: 5, verified: true  },
    { tag: "wasm",   proficiency: 5, verified: true  },
    { tag: "kafka",  proficiency: 4, verified: true  },
    { tag: "figma",  proficiency: 3, verified: false },
  ],
};

// Demo activity (mock recent deployments / milestones)
const DEMO_ACTIVITY = [
  { id: "a1", label: "DataSync Agent v2.1 deployed",   at: "2h ago",  success: true  },
  { id: "a2", label: "LogAudit Sentinel — DoD passed", at: "1d ago",  success: true  },
  { id: "a3", label: "Smoke test failed — remediated", at: "3d ago",  success: false },
  { id: "a4", label: "Biometric ZK proof verified",    at: "5d ago",  success: true  },
  { id: "a5", label: "LinkedIn credentials confirmed", at: "8d ago",  success: true  },
];

// Role-specific stat cards
const ROLE_STATS: Record<string, { label: string; value: string; icon: React.ElementType }[]> = {
  client: [
    { label: "Deployments",    value: "3",     icon: Rocket      },
    { label: "Agents Active",  value: "2",     icon: Bot         },
    { label: "Avg Trust Score",value: "72",    icon: Shield      },
  ],
  talent: [
    { label: "Deployments Done", value: "12", icon: Rocket      },
    { label: "Reputation Score", value: "73", icon: Star        },
    { label: "Escrow Earned",    value: "$1.8k", icon: TrendingUp },
  ],
  developer: [
    { label: "Agents Published",  value: "4",    icon: Bot         },
    { label: "Total Licenses",    value: "19",   icon: Star        },
    { label: "Escrow Earned",     value: "$12k", icon: TrendingUp  },
  ],
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!s) { router.push("/login?next=/profile"); return; }
        setSession(s);
      })
      .catch(() => router.push("/login?next=/profile"));
  }, [router]);

  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const primaryRole = session.roles[0];
  const stats       = ROLE_STATS[primaryRole] ?? ROLE_STATS.talent;
  const signals     = DEMO_SIGNALS[session.email] ?? DEMO_SIGNALS["talent@demo.com"];
  const skills      = DEMO_SKILLS[session.email]  ?? DEMO_SKILLS["talent@demo.com"];
  const tier        = session.identity_tier as 0 | 1 | 2;

  return (
    <div className="min-h-screen bg-zinc-950">

      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors font-mono text-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Dashboard
          </Link>
          <span className="text-zinc-800">/</span>
          <span className="font-mono text-xs text-zinc-400">Profile</span>
          <div className="ml-auto">
            <TrustScoreBadge
              score={session.trust_score}
              biometricVerified={tier === 2}
            />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Identity card */}
        <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-4">
          <div className="flex items-start gap-4">
            {/* Avatar placeholder — initials */}
            <div className="w-12 h-12 rounded-sm bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
              <span className="font-mono text-base font-medium text-zinc-300">
                {session.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
              </span>
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              <p className="font-mono text-sm font-medium text-zinc-100">{session.name}</p>
              <p className="font-mono text-xs text-zinc-500 truncate">{session.email}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {session.roles.map((role) => (
                  <span
                    key={role}
                    className="font-mono text-[10px] capitalize border border-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded-sm"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Role stats */}
        <div className="grid grid-cols-3 gap-2">
          {stats.map(({ label, value, icon: Icon }) => (
            <div key={label} className="border border-zinc-800 rounded-sm bg-zinc-900 p-3 space-y-1">
              <div className="flex items-center gap-1.5">
                <Icon className="w-3 h-3 text-zinc-600" />
                <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">{label}</p>
              </div>
              <p className="font-mono text-lg font-medium text-zinc-100 tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        {/* Vetting badge — full expandable */}
        <div className="space-y-2">
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Vetting Status</p>
          <VettingBadge tier={tier} expandable />
        </div>

        {/* Platforms + Skills */}
        <div className="border border-zinc-800 rounded-sm bg-zinc-900/60 p-4">
          <VerifiedSkillsChips signals={signals} skills={skills} />
        </div>

        {/* Next steps to upgrade tier */}
        {tier < 2 && (
          <div className="border border-amber-900 rounded-sm bg-amber-950/20 p-4 space-y-3">
            <p className="font-mono text-xs text-amber-400 uppercase tracking-widest">
              Upgrade to Tier {tier + 1}
            </p>
            {tier === 0 && (
              <ul className="space-y-1.5">
                {[
                  "Connect LinkedIn and verify employment",
                  "Submit government-issued ID",
                ].map((step) => (
                  <li key={step} className="flex items-start gap-2 font-mono text-xs text-zinc-400">
                    <Clock className="w-3 h-3 text-amber-600 flex-shrink-0 mt-0.5" />
                    {step}
                  </li>
                ))}
              </ul>
            )}
            {tier === 1 && (
              <ul className="space-y-1.5">
                {[
                  "Complete ZK biometric liveness proof via identity wallet",
                  "Pass a live 30-minute video interview",
                  "Submit and pass a supervised sample deployment",
                  "Provide 2+ verified client references",
                ].map((step) => (
                  <li key={step} className="flex items-start gap-2 font-mono text-xs text-zinc-400">
                    <Clock className="w-3 h-3 text-amber-600 flex-shrink-0 mt-0.5" />
                    {step}
                  </li>
                ))}
              </ul>
            )}
            <button className="flex items-center gap-2 h-10 px-4 rounded-sm border border-amber-800 bg-amber-950
                               text-amber-400 font-mono text-xs uppercase tracking-widest
                               hover:border-amber-600 active:scale-[0.98] transition-all w-full justify-center">
              Open Identity Wallet
            </button>
          </div>
        )}

        {/* Recent activity */}
        <div className="space-y-2">
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Recent Activity</p>
          <div className="border border-zinc-800 rounded-sm bg-zinc-900 divide-y divide-zinc-800">
            {DEMO_ACTIVITY.map((ev) => (
              <div key={ev.id} className="flex items-center gap-3 px-3 py-2.5">
                {ev.success
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  : <div className="w-3.5 h-3.5 rounded-full border border-amber-700 flex-shrink-0" />
                }
                <p className="font-mono text-xs text-zinc-300 flex-1 min-w-0 truncate">{ev.label}</p>
                <span className="font-mono text-[10px] text-zinc-600 flex-shrink-0">{ev.at}</span>
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  );
}
