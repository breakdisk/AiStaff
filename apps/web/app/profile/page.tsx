"use client";

import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft, Bot, Star, TrendingUp, Rocket,
  CheckCircle2, Clock, Shield, Github, Linkedin, CheckCheck, AlertTriangle,
} from "lucide-react";
import { VettingBadge }              from "@/components/VettingBadge";
import { VerifiedSkillsChips }       from "@/components/VerifiedSkillsChips";
import { TrustScoreBadge }           from "@/components/TrustScoreBadge";
import type { PlatformSignal, SkillTag } from "@/components/VerifiedSkillsChips";

// ── Demo skill data ────────────────────────────────────────────────────────────

const DEMO_SKILLS: SkillTag[] = [
  { tag: "rust",   proficiency: 4, verified: true  },
  { tag: "kafka",  proficiency: 3, verified: true  },
  { tag: "wasm",   proficiency: 3, verified: false },
  { tag: "python", proficiency: 2, verified: false },
];

const DEMO_ACTIVITY = [
  { id: "a1", label: "Signed in via OAuth",           at: "just now", success: true  },
  { id: "a2", label: "Profile created",               at: "just now", success: true  },
  { id: "a3", label: "DataSync Agent v2.1 deployed",  at: "2h ago",   success: true  },
  { id: "a4", label: "LogAudit Sentinel — DoD passed",at: "1d ago",   success: true  },
  { id: "a5", label: "Smoke test — remediated",       at: "3d ago",   success: false },
];

// ── Tier helpers ───────────────────────────────────────────────────────────────

type TierString = "UNVERIFIED" | "SOCIAL_VERIFIED" | "BIOMETRIC_VERIFIED";

function tierToNum(t: TierString | string | undefined): 0 | 1 | 2 {
  if (t === "SOCIAL_VERIFIED")   return 1;
  if (t === "BIOMETRIC_VERIFIED") return 2;
  return 0;
}

// ── Connected accounts section ─────────────────────────────────────────────────

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

const PROVIDERS = [
  {
    id: "github",
    label: "GitHub",
    icon: <Github className="w-4 h-4 text-zinc-300" />,
    tierNote: "+30 pts · technical verification",
  },
  {
    id: "google",
    label: "Google",
    icon: <GoogleIcon className="w-4 h-4" />,
    tierNote: "auth only · no trust score",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: <Linkedin className="w-4 h-4 text-zinc-300" />,
    tierNote: "+15 pts · professional verification",
  },
];

function ConnectedAccounts({ provider }: { provider: string }) {
  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900 divide-y divide-zinc-800">
      {PROVIDERS.map((p) => {
        const connected = p.id === provider;
        return (
          <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
            {p.icon}
            <div className="flex-1 min-w-0">
              <p className="font-mono text-xs text-zinc-200">{p.label}</p>
              <p className="font-mono text-[10px] text-zinc-600">{p.tierNote}</p>
            </div>
            {connected ? (
              <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-500">
                <CheckCheck className="w-3 h-3" /> Connected
              </span>
            ) : (
              <button
                onClick={() => signIn(p.id)}
                className="font-mono text-[10px] text-amber-400 hover:text-amber-300
                           border border-amber-900 hover:border-amber-700 px-2 py-1
                           rounded-sm transition-colors"
              >
                Connect →
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Role stats ─────────────────────────────────────────────────────────────────

const ROLE_STATS: Record<string, { label: string; value: string; icon: React.ElementType }[]> = {
  client: [
    { label: "Deployments",    value: "3",     icon: Rocket      },
    { label: "Agents Active",  value: "2",     icon: Bot         },
    { label: "Avg Trust Score",value: "72",    icon: Shield      },
  ],
  talent: [
    { label: "Deployments Done", value: "12",   icon: Rocket      },
    { label: "Reputation Score", value: "73",   icon: Star        },
    { label: "Escrow Earned",    value: "$1.8k", icon: TrendingUp },
  ],
  developer: [
    { label: "Agents Published", value: "4",    icon: Bot         },
    { label: "Total Licenses",   value: "19",   icon: Star        },
    { label: "Escrow Earned",    value: "$12k", icon: TrendingUp  },
  ],
};

// ── Demo platform signals ──────────────────────────────────────────────────────

function buildSignals(provider: string): PlatformSignal[] {
  const out: PlatformSignal[] = [];
  if (provider === "github" || provider === "linkedin") {
    out.push({
      id: provider,
      platform: provider as PlatformSignal["platform"],
      label: provider === "github" ? "GitHub" : "LinkedIn",
      detail: provider === "github"
        ? "Connected via OAuth"
        : "Connected via OAuth · email verified",
      verified: true,
    });
  }
  return out;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session?.user) {
    return null; // middleware redirects unauthenticated users
  }

  const user       = session.user;
  const tier       = tierToNum(user.identityTier);
  const primaryRole = (user.roles?.[0] as string) ?? "talent";
  const stats      = ROLE_STATS[primaryRole] ?? ROLE_STATS.talent;
  const signals    = buildSignals(user.provider ?? "");
  const trustScore = user.trustScore ?? 0;

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
            <TrustScoreBadge score={trustScore} biometricVerified={tier === 2} />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Tier 0 banner */}
        {tier === 0 && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-sm border border-amber-900 bg-amber-950/20">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-mono text-xs text-amber-400 font-medium">
                Connect GitHub or LinkedIn to receive job matches
              </p>
              <p className="font-mono text-[10px] text-amber-700 mt-0.5">
                Google sign-in grants browse access only (Tier 0).
                Add GitHub for technical roles or LinkedIn for consulting roles.
              </p>
            </div>
          </div>
        )}

        {/* Identity card */}
        <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-4">
          <div className="flex items-start gap-4">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt={user.name ?? ""} className="w-12 h-12 rounded-sm border border-zinc-700 object-cover flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-sm bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                <span className="font-mono text-base font-medium text-zinc-300">
                  {(user.name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-1">
              <p className="font-mono text-sm font-medium text-zinc-100">{user.name}</p>
              <p className="font-mono text-xs text-zinc-500 truncate">{user.email}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {(user.roles ?? ["talent"]).map((role) => (
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

          {/* Trust score bar */}
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Trust Score</span>
              <span className="font-mono text-[10px] text-zinc-400 tabular-nums">{trustScore} / 100</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-700"
                style={{ width: `${trustScore}%` }}
              />
            </div>
            <p className="font-mono text-[10px] text-zinc-600">
              GitHub +30 · LinkedIn +15 · Biometric ZK +40
            </p>
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

        {/* Vetting badge */}
        <div className="space-y-2">
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Vetting Status</p>
          <VettingBadge tier={tier} expandable />
        </div>

        {/* Connected accounts */}
        <div className="space-y-2">
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Connected Accounts</p>
          <ConnectedAccounts provider={user.provider ?? ""} />
        </div>

        {/* Platforms + Skills */}
        {signals.length > 0 && (
          <div className="border border-zinc-800 rounded-sm bg-zinc-900/60 p-4">
            <VerifiedSkillsChips signals={signals} skills={DEMO_SKILLS} />
          </div>
        )}

        {/* Upgrade prompt */}
        {tier < 2 && (
          <div className="border border-amber-900 rounded-sm bg-amber-950/20 p-4 space-y-3">
            <p className="font-mono text-xs text-amber-400 uppercase tracking-widest">
              Upgrade to Tier {tier + 1}
            </p>
            {tier === 0 && (
              <ul className="space-y-1.5">
                {[
                  "Connect GitHub — unlocks technical job matching (+30 pts)",
                  "Connect LinkedIn — unlocks consulting roles (+15 pts)",
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
                  "Unlocks high-value contracts + auto escrow release",
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
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
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
