"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { LogOut, MessageSquare, ExternalLink } from "lucide-react";
import type { Session } from "@/lib/session";
import { StitchingDashboard }    from "@/components/StitchingDashboard";
import { VetoCard }               from "@/components/VetoCard";
import { TrustScoreBadge }        from "@/components/TrustScoreBadge";
import { VettingBadge }           from "@/components/VettingBadge";
import { VerifiedSkillsChips }    from "@/components/VerifiedSkillsChips";
import type { PlatformSignal, SkillTag } from "@/components/VerifiedSkillsChips";
import MatchScoreCard             from "@/components/MatchScoreCard";
import LicenseKeyCard             from "@/components/LicenseKeyCard";
import AgentHealthWidget          from "@/components/AgentHealthWidget";
import DodChecklistCard           from "@/components/DodChecklistCard";
import ReputationBadge            from "@/components/ReputationBadge";
import { roiToReputation }        from "@/lib/roi";
import {
  fetchRoiReport,
  fetchMatches,
  exportVc,
  fetchHeartbeats,
  fetchDriftEvents,
  fetchChecklistSteps,
  fetchPublicProfile,
  fetchTalentSkills,
  vetoDeployment,
  approveDeployment,
  type RoiReport,
  type MatchResult,
  type Heartbeat,
  type ChecklistStep,
  type PublicProfile,
} from "@/lib/api";

// ── Demo fallback data ────────────────────────────────────────────────────────
// Used when the corresponding service is unreachable.

const DEMO_TALENT_ID = "tal-00000001-0000-0000-0000-aaaaaaaaaaaa";

const DEMO_PROFILE = {
  currentTier:         "SocialVerified" as const,
  trustScore:          58,
  biometricCommitment: undefined,
  deepLinkUrl:         "openid4vp://?request_uri=https%3A%2F%2Fapi.aistaffapp.com%2Fidentity%2Fvp-request",
  githubLogin:         "dev-user",
  linkedinVerified:    true,
};

const DEMO_DEPLOYMENT = {
  deploymentId:  "dep-01J9X2Z3",
  agentName:     "DataSync Agent v2.1",
  totalCents:    120000,
  talentCents:   36000,
  talentId:      DEMO_TALENT_ID,
  vetoWindowEnd: new Date(Date.now() + 25_000),
};

const DEMO_LICENSE = {
  licenseId:    "lic-f47ac10b-58cc-4372-a567-0e02b2c3d479",
  jurisdiction: "US",
  seats:        5,
  expiresAt:    new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
  revoked:      false,
};

const DEMO_HEARTBEATS = [
  { cpu_pct: 12.4, mem_bytes: 128 * 1024 * 1024, artifact_hash: "sha256:a1b2c3d4e5f6", recorded_at: "" },
  { cpu_pct: 18.1, mem_bytes: 135 * 1024 * 1024, artifact_hash: "sha256:a1b2c3d4e5f6", recorded_at: "" },
  { cpu_pct: 14.7, mem_bytes: 131 * 1024 * 1024, artifact_hash: "sha256:a1b2c3d4e5f6", recorded_at: "" },
  { cpu_pct: 22.3, mem_bytes: 142 * 1024 * 1024, artifact_hash: "sha256:a1b2c3d4e5f6", recorded_at: "" },
  { cpu_pct: 19.8, mem_bytes: 138 * 1024 * 1024, artifact_hash: "sha256:a1b2c3d4e5f6", recorded_at: "" },
];

const DEMO_CHECKLIST = {
  deploymentId: "dep-01J9X2Z3",
  steps: [
    { step_id: "env_preflight_passed",       step_label: "Env preflight",    passed: true  },
    { step_id: "license_validated",          step_label: "License validated", passed: true  },
    { step_id: "wasm_hash_verified",         step_label: "Wasm hash verified",passed: true  },
    { step_id: "network_egress_configured",  step_label: "Network egress",    passed: true  },
    { step_id: "smoke_test_passed",          step_label: "Smoke test",        passed: false },
    { step_id: "client_acceptance_signed",   step_label: "Client acceptance", passed: false },
  ],
  finalized: false,
  allPassed: false,
};

// Demo skill signals — keyed by mock account email
const DEMO_SIGNALS: Record<string, PlatformSignal[]> = {
  "client@demo.com": [
    { id: "gh",  platform: "github",  label: "GitHub",  detail: "18 public repos · member since 2021", url: "#", verified: true  },
    { id: "li",  platform: "linkedin", label: "LinkedIn", detail: "Product Manager · Acme Corp",        url: "#", verified: true  },
  ],
  "talent@demo.com": [
    { id: "gh",  platform: "github",  label: "GitHub",  detail: "92 public repos · member since 2019", url: "#", verified: true  },
    { id: "li",  platform: "linkedin", label: "LinkedIn", detail: "Senior Rust Engineer · remote",      url: "#", verified: true  },
    { id: "cert",platform: "certification", label: "Wasm Systems Cert", detail: "Bytecode Alliance · 2025", verified: true },
  ],
  "dev@demo.com": [
    { id: "gh",  platform: "github",  label: "GitHub",  detail: "134 public repos · member since 2018", url: "#", verified: true },
    { id: "li",  platform: "linkedin", label: "LinkedIn", detail: "Staff Engineer · self-employed",      url: "#", verified: true },
    { id: "fig", platform: "figma",    label: "Figma",   detail: "Portfolio: 4 published systems",       url: "#", verified: false },
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

const DEMO_REPUTATION = {
  talentId:         DEMO_TALENT_ID,
  reputationScore:  73.4,
  totalDeployments: 12,
  totalEarnedCents: 184500,
  driftIncidents:   1,
  vcIssued:         true,
};

const DEMO_MATCHES = {
  agentId: "agt-00000001-0000-0000-0000-000000000001",
  matches: [
    { talent_id: "tal-00000001-0000-0000-0000-aaaaaaaaaaaa", match_score: 0.92, trust_score: 82, skill_tags: ["rust", "wasm"] },
    { talent_id: "tal-00000002-0000-0000-0000-bbbbbbbbbbbb", match_score: 0.87, trust_score: 61, skill_tags: ["rust", "kafka"] },
    { talent_id: "tal-00000003-0000-0000-0000-cccccccccccc", match_score: 0.74, trust_score: 45, skill_tags: ["rust"] },
    { talent_id: "tal-00000004-0000-0000-0000-dddddddddddd", match_score: 0.51, trust_score: 30, skill_tags: ["python"] },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Live-data helpers ─────────────────────────────────────────────────────────

function tierToStitching(tier: string): "Unverified" | "SocialVerified" | "BiometricVerified" {
  if (tier === "BIOMETRIC_VERIFIED") return "BiometricVerified";
  if (tier === "SOCIAL_VERIFIED")    return "SocialVerified";
  return "Unverified";
}

function buildSignals(profile: PublicProfile): PlatformSignal[] {
  const out: PlatformSignal[] = [];
  if (profile.github_connected)
    out.push({ id: "gh",   platform: "github",   label: "GitHub",   detail: "Connected", url: "#", verified: true });
  if (profile.linkedin_connected)
    out.push({ id: "li",   platform: "linkedin", label: "LinkedIn", detail: "Connected", url: "#", verified: true });
  // Google is auth-only — not a portfolio platform, no icon in VerifiedSkillsChips
  return out;
}

function matchResultToProps(result: MatchResult) {
  return {
    agentId: result.request_id,
    matches: result.matches.map((m) => ({
      talent_id:   m.talent_id,
      match_score: m.match_score,
      trust_score: m.trust_score,
      skill_tags:  m.skill_tags,
    })),
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.ok ? r.json() : null)
      .then((s: Session | null) => {
        setSession(s);
        // First-time Tier 0 users → onboarding wizard
        if (
          s?.identityTier === "UNVERIFIED" &&
          typeof window !== "undefined" &&
          !localStorage.getItem("onboarding_done")
        ) {
          router.replace("/onboarding");
        }
      })
      .catch(() => null);
  }, [router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const [reputation, setReputation]   = useState(DEMO_REPUTATION);
  const [matchData,  setMatchData]    = useState(DEMO_MATCHES);
  const [vcExporting, setVcExporting] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<"live" | "demo" | "loading">("loading");
  const [heartbeats,  setHeartbeats]  = useState<Heartbeat[]>(DEMO_HEARTBEATS);
  const [driftCount,  setDriftCount]  = useState(0);
  const [checklist,   setChecklist]   = useState<{ steps: ChecklistStep[]; finalized: boolean; allPassed: boolean }>({
    steps:     DEMO_CHECKLIST.steps,
    finalized: DEMO_CHECKLIST.finalized,
    allPassed: DEMO_CHECKLIST.allPassed,
  });
  const [publicProfile,  setPublicProfile]  = useState<PublicProfile | null>(null);
  const [liveSkills,     setLiveSkills]     = useState<SkillTag[] | null>(null);
  const [myEngagements,  setMyEngagements]  = useState<Array<{
    id: string; agent_name: string; state: string;
    escrow_amount_cents: number; created_at: string;
  }> | null>(null);

  // Fetch ROI / reputation + public profile + skills once session is available
  useEffect(() => {
    const profileId = session?.profileId;
    if (!profileId) return;

    fetchRoiReport(profileId)
      .then((roi) => {
        setReputation({ ...roiToReputation(roi), vcIssued: false });
        setServiceStatus("live");
      })
      .catch(() => setServiceStatus("demo"));

    fetchPublicProfile(profileId)
      .then(setPublicProfile)
      .catch(() => {/* keep demo */});

    fetchTalentSkills(profileId)
      .then((r) => {
        if (r.skills.length > 0) {
          setLiveSkills(r.skills.map((s) => ({
            tag:         s.tag,
            proficiency: (Math.min(5, Math.max(1, s.proficiency)) as 1 | 2 | 3 | 4 | 5),
            verified:    s.verified_at !== null,
          })));
        }
      })
      .catch(() => {/* keep demo */});

    // Fetch real deployments for "My Engagements"
    fetch("/api/marketplace/my-deployments")
      .then(r => r.ok ? r.json() : [])
      .then(setMyEngagements)
      .catch(() => setMyEngagements([]));
  }, [session]);

  // Fetch talent matches from matching service
  useEffect(() => {
    fetchMatches({
      request_id:      "req-dashboard-001",
      agent_id:        DEMO_MATCHES.agentId,
      required_skills: ["rust", "wasm", "kafka"],
      min_trust_score: 30,
    })
      .then((result) => setMatchData(matchResultToProps(result)))
      .catch(() => {/* keep demo data */});
  }, []);

  // Fetch agent health from telemetry service
  useEffect(() => {
    const depId = DEMO_DEPLOYMENT.deploymentId;
    Promise.allSettled([
      fetchHeartbeats(depId),
      fetchDriftEvents(depId),
    ]).then(([hbResult, driftResult]) => {
      if (hbResult.status === "fulfilled" && hbResult.value.length > 0) {
        setHeartbeats(hbResult.value);
      }
      if (driftResult.status === "fulfilled") {
        setDriftCount(driftResult.value.length);
      }
    });
  }, []);

  // Fetch DoD checklist from checklist service
  useEffect(() => {
    fetchChecklistSteps(DEMO_DEPLOYMENT.deploymentId)
      .then((steps) => {
        if (steps.length > 0) {
          const allPassed  = steps.every((s) => s.passed);
          const finalized  = steps.length >= 6;
          setChecklist({ steps, finalized, allPassed });
        }
      })
      .catch(() => {/* keep demo data */});
  }, []);

  const handleExportVc = useCallback(async () => {
    setVcExporting(true);
    try {
      await exportVc(reputation.talentId);
      setReputation((prev) => ({ ...prev, vcIssued: true }));
    } catch {
      // VC export service unavailable — silently degrade
    } finally {
      setVcExporting(false);
    }
  }, [reputation.talentId]);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      {/* Sidebar — hidden on mobile */}
      <aside className="hidden lg:flex lg:flex-col w-56 border-r border-zinc-800 bg-zinc-950 p-4 gap-6 lg:h-screen lg:sticky lg:top-0 overflow-y-auto">
        <div className="flex items-center justify-between">
          <img src="/logo.png" alt="AiStaff" className="h-20 w-auto" />
          {/* Live / demo indicator */}
          <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded-sm border ${
            serviceStatus === "live"
              ? "border-green-800 text-green-400"
              : serviceStatus === "demo"
              ? "border-zinc-700 text-zinc-500"
              : "border-zinc-800 text-zinc-700"
          }`}>
            {serviceStatus === "live" ? "LIVE" : serviceStatus === "demo" ? "DEMO" : "…"}
          </span>
        </div>
        <nav className="flex flex-col gap-1">
          {[
            { label: "Dashboard",    href: "/dashboard",   active: true  },
            { label: "Marketplace",  href: "/marketplace", active: false },
            { label: "Leaderboard",  href: "/leaderboard", active: false },
            { label: "Matching",     href: "/matching",    active: false },
            { label: "Profile",      href: "/profile",     active: false },
          ].map(({ label, href, active }) => (
            <a
              key={label}
              href={href}
              className={`px-3 py-2 rounded-sm font-mono text-xs transition-colors ${
                active
                  ? "text-zinc-100 bg-zinc-800"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
              }`}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">AI Tools</p>
          {[
            { label: "Scoping",      href: "/scoping"      },
            { label: "Outcomes",     href: "/outcomes"     },
            { label: "Proposals",    href: "/proposals"    },
            { label: "Pricing Tool", href: "/pricing-tool" },
          ].map(({ label, href }) => (
            <a key={label} href={href}
              className="block px-3 py-1.5 rounded-sm font-mono text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
            >{label}</a>
          ))}
        </div>
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">Payments</p>
          {[
            { label: "Escrow",             href: "/escrow"             },
            { label: "Payouts",            href: "/payouts"            },
            { label: "Billing",            href: "/billing"            },
            { label: "Smart Contracts",    href: "/smart-contracts"    },
            { label: "Outcome Listings",   href: "/outcome-listings"   },
            { label: "Pricing Calculator", href: "/pricing-calculator" },
          ].map(({ label, href }) => (
            <a key={label} href={href}
              className="block px-3 py-1.5 rounded-sm font-mono text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
            >{label}</a>
          ))}
        </div>
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">Workspace</p>
          {[
            { label: "Work Diaries",  href: "/work-diaries"  },
            { label: "Async Collab",  href: "/async-collab"  },
            { label: "Collaboration", href: "/collab"         },
            { label: "Success Layer", href: "/success-layer"  },
            { label: "Quality Gate",  href: "/quality-gate"   },
          ].map(({ label, href }) => (
            <a key={label} href={href}
              className="block px-3 py-1.5 rounded-sm font-mono text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
            >{label}</a>
          ))}
        </div>
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">Legal</p>
          {[
            { label: "Legal Toolkit",    href: "/legal-toolkit"     },
            { label: "Tax Engine",       href: "/tax-engine"        },
            { label: "Reputation",       href: "/reputation-export" },
            { label: "Transparency",     href: "/transparency"      },
          ].map(({ label, href }) => (
            <a key={label} href={href}
              className="block px-3 py-1.5 rounded-sm font-mono text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
            >{label}</a>
          ))}
        </div>
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">Notifications</p>
          {[
            { label: "Alerts",    href: "/notifications"         },
            { label: "Reminders", href: "/reminders"             },
            { label: "Settings",  href: "/notification-settings" },
          ].map(({ label, href }) => (
            <a key={label} href={href}
              className="block px-3 py-1.5 rounded-sm font-mono text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
            >{label}</a>
          ))}
        </div>
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">Enterprise</p>
          {[
            { label: "Industry Suites", href: "/vertical"               },
            { label: "Enterprise Hub",  href: "/enterprise"             },
            { label: "Talent Pools",    href: "/enterprise/talent-pools" },
            { label: "SLA Dashboard",   href: "/enterprise/sla"         },
            { label: "Global & Access", href: "/global"                 },
          ].map(({ label, href }) => (
            <a key={label} href={href}
              className="block px-3 py-1.5 rounded-sm font-mono text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
            >{label}</a>
          ))}
        </div>

        <div className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">Trust</p>
          {[
            { label: "Proof of Human", href: "/proof-of-human" },
          ].map(({ label, href }) => (
            <a key={label} href={href}
              className="block px-3 py-1.5 rounded-sm font-mono text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
            >{label}</a>
          ))}
        </div>

        {/* User chip + logout */}
        <div className="mt-auto pt-4 border-t border-zinc-800 space-y-2">
          {session && (
            <div className="px-2 space-y-0.5">
              <p className="font-mono text-xs text-zinc-300 truncate">{session.name}</p>
              <p className="font-mono text-[10px] text-zinc-600 truncate capitalize">
                {session.roles.join(" + ")} · Tier {session.identityTier} · {session.trustScore} pts
              </p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-sm font-mono text-xs
                       text-zinc-500 hover:text-red-400 hover:bg-red-950/30
                       transition-colors border border-transparent hover:border-red-900/50"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-4 pb-20 lg:pb-4 space-y-4 max-w-2xl mx-auto w-full">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
            Dashboard
          </h1>
          <TrustScoreBadge
            score={session?.trustScore ?? DEMO_PROFILE.trustScore}
            biometricVerified={session ? session.identityTier === "BIOMETRIC_VERIFIED" : !!DEMO_PROFILE.biometricCommitment}
          />
        </div>

        {/* Action Required — Veto window */}
        <section>
          <SectionLabel>Action Required</SectionLabel>
          <VetoCard
            {...DEMO_DEPLOYMENT}
            onVeto={async (id, reason) => {
              await vetoDeployment(id, DEMO_DEPLOYMENT.talentId, reason).catch(() => {
                // Veto API unavailable — local state only
              });
            }}
            onApprove={async (id) => {
              await approveDeployment(id, DEMO_DEPLOYMENT.talentId).catch(() => {
                // Approve API unavailable — local state only
              });
            }}
          />
        </section>

        {/* My Engagements — real deployments with Collaborate links */}
        <section>
          <SectionLabel>My Engagements</SectionLabel>
          <div className="border border-zinc-800 rounded-sm overflow-hidden">
            {myEngagements === null ? (
              <p className="font-mono text-[10px] text-zinc-600 px-3 py-3">Loading…</p>
            ) : myEngagements.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="font-mono text-[10px] text-zinc-600">No engagements yet</p>
                <a href="/marketplace" className="inline-flex items-center gap-1 mt-2 font-mono text-[9px] text-amber-400 hover:text-amber-300">
                  <ExternalLink className="w-2.5 h-2.5" /> Browse Marketplace
                </a>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {myEngagements.map(eng => {
                  const stateCls =
                    eng.state === "RELEASED" ? "text-emerald-400" :
                    eng.state === "VETOED"   ? "text-red-400" :
                    eng.state === "FAILED"   ? "text-red-500" :
                    "text-amber-400";
                  return (
                    <div key={eng.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-zinc-100 truncate">{eng.agent_name}</p>
                        <p className="font-mono text-[9px] text-zinc-600">{eng.created_at} · <span className={stateCls}>{eng.state}</span></p>
                        <p className="font-mono text-[9px] text-zinc-600 mt-0.5 select-all">{eng.id}</p>
                      </div>
                      <a
                        href={`/collab?deployment_id=${eng.id}`}
                        className="flex-shrink-0 flex items-center gap-1 font-mono text-[9px] text-amber-400 border border-amber-900 bg-amber-950/40 px-2 h-6 rounded-sm hover:border-amber-700 transition-colors"
                      >
                        <MessageSquare className="w-2.5 h-2.5" /> Collaborate
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Talent Matches — Bot Orchestrator */}
        <section>
          <SectionLabel>Talent Matches</SectionLabel>
          <MatchScoreCard {...matchData} />
        </section>

        {/* Two-column: License + Reputation */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <SectionLabel>Active License</SectionLabel>
            <LicenseKeyCard {...DEMO_LICENSE} />
          </div>
          <div>
            <SectionLabel>Reputation</SectionLabel>
            <ReputationBadge
              {...reputation}
              onExportVc={vcExporting ? async () => {} : handleExportVc}
            />
          </div>
        </section>

        {/* Agent Health */}
        <section>
          <SectionLabel>Agent Health</SectionLabel>
          <AgentHealthWidget
            deploymentId={DEMO_DEPLOYMENT.deploymentId}
            heartbeats={heartbeats}
            driftCount={driftCount}
          />
        </section>

        {/* DoD Checklist */}
        <section>
          <SectionLabel>Installation DoD</SectionLabel>
          <DodChecklistCard
            deploymentId={DEMO_DEPLOYMENT.deploymentId}
            steps={checklist.steps}
            finalized={checklist.finalized}
            allPassed={checklist.allPassed}
          />
        </section>

        {/* Vetting & Credentials */}
        <section>
          <SectionLabel>Vetting Status</SectionLabel>
          <VettingBadge
            tier={(session?.identityTier === "BIOMETRIC_VERIFIED" ? 2 : session?.identityTier === "SOCIAL_VERIFIED" ? 1 : 0) as 0 | 1 | 2}
            expandable
          />
        </section>

        {/* Verified Skills & Platform Signals */}
        <section>
          <SectionLabel>Verified Skills &amp; Platforms</SectionLabel>
          <div className="border border-zinc-800 rounded-sm p-4 bg-zinc-900/60">
            <VerifiedSkillsChips
              signals={
                publicProfile
                  ? buildSignals(publicProfile)
                  : (DEMO_SIGNALS[session?.email ?? ""] ?? DEMO_SIGNALS["talent@demo.com"])
              }
              skills={
                liveSkills
                  ?? (DEMO_SKILLS[session?.email ?? ""] ?? DEMO_SKILLS["talent@demo.com"])
              }
            />
          </div>
        </section>

        {/* Identity stitching */}
        <section>
          <SectionLabel>Identity Stitching</SectionLabel>
          <div className="border border-zinc-800 rounded-sm p-4 bg-zinc-900">
            <StitchingDashboard
              currentTier={
                session
                  ? tierToStitching(session.identityTier)
                  : DEMO_PROFILE.currentTier
              }
              trustScore={session?.trustScore ?? DEMO_PROFILE.trustScore}
              biometricCommitment={undefined}
              deepLinkUrl={DEMO_PROFILE.deepLinkUrl}
              githubLogin={
                publicProfile?.github_connected
                  ? (session?.name ?? "user")
                  : DEMO_PROFILE.githubLogin
              }
              linkedinVerified={
                publicProfile
                  ? publicProfile.linkedin_connected
                  : DEMO_PROFILE.linkedinVerified
              }
            />
          </div>
        </section>

      </main>

      {/* Bottom tab bar — mobile only */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50
                   h-16 flex items-center border-t border-zinc-800 bg-zinc-950"
      >
        {[
          { label: "Dashboard", href: "/dashboard",   active: true  },
          { label: "Market",    href: "/marketplace", active: false },
          { label: "Matching",  href: "/matching",    active: false },
          { label: "Profile",   href: "/profile",     active: false },
        ].map(({ label, href, active }) => (
          <a key={label} href={href} className={`nav-tab ${active ? "active" : ""}`}>
            <span className="text-[10px]">{label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-2">
      {children}
    </p>
  );
}
