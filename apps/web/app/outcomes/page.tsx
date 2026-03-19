"use client";

import { useState } from "react";
import Link from "next/link";
import { TrendingUp, ChevronDown, ChevronUp, ArrowUpRight, Loader2, CheckCircle2 } from "lucide-react";
import { SubScoreBar } from "@/components/SubScoreBar";
import { VettingBadge } from "@/components/VettingBadge";
import { inviteToProject } from "@/lib/api";

// ── Demo data ──────────────────────────────────────────────────────────────────

interface OutcomeMatch {
  id:            string;
  name:          string;
  title:         string;
  match_score:   number;
  trust_score:   number;
  identity_tier: 0 | 1 | 2;
  outcomes:      { metric: string; value: string; client_type: string }[];
  case_studies:  { project: string; result: string; duration: string }[];
  rate_cents:    number;
  roi_score:     number; // 0–100 composite
}

const DEMO_OUTCOMES: OutcomeMatch[] = [
  {
    id:            "de000002-0000-0000-0000-222222222222",
    name:          "Marcus T.",
    title:         "Senior Rust / Wasm Engineer",
    match_score:   0.94,
    trust_score:   94,
    identity_tier: 2,
    rate_cents:    18500,
    roi_score:     91,
    outcomes: [
      { metric: "Conversion Rate",    value: "+18%",   client_type: "SaaS startup (similar stack)" },
      { metric: "Deployment Time",    value: "−42%",   client_type: "FinTech platform"             },
      { metric: "Incident Rate",      value: "−3×",    client_type: "E-commerce (Tier 2 escrow)"   },
    ],
    case_studies: [
      { project: "DataSync pipeline for Stripe webhook processing", result: "Reduced manual reconciliation from 4h/day to 12min", duration: "11 days" },
      { project: "Kafka consumer cluster migration",                result: "Zero-downtime cutover, $18k infra savings/yr",       duration: "8 days"  },
    ],
  },
  {
    id:            "de000003-0000-0000-0000-333333333333",
    name:          "Lena K.",
    title:         "ML Systems Architect",
    match_score:   0.87,
    trust_score:   88,
    identity_tier: 2,
    rate_cents:    21000,
    roi_score:     84,
    outcomes: [
      { metric: "Model Accuracy",     value: "+23%",   client_type: "Health-tech API"               },
      { metric: "Inference Latency",  value: "−60%",   client_type: "Real-time scoring SaaS"        },
      { metric: "Client Retention",   value: "+34%",   client_type: "ML-first startup"              },
    ],
    case_studies: [
      { project: "Custom RAG pipeline over private docs",       result: "Replaced $2.8k/mo SaaS tool with internal system", duration: "14 days" },
      { project: "Anomaly detection for IoT sensor stream",     result: "93% precision, false-positive rate below 1%",       duration: "9 days"  },
    ],
  },
  {
    id:            "a6000001-0000-0000-0000-a1a1a1a1a1a1",
    name:          "Diego R.",
    title:         "DevOps + Wasm Specialist",
    match_score:   0.78,
    trust_score:   72,
    identity_tier: 1,
    rate_cents:    9500,
    roi_score:     71,
    outcomes: [
      { metric: "Deploy Frequency",   value: "+3×",    client_type: "DevOps consultancy"            },
      { metric: "MTTR",               value: "−55%",   client_type: "SRE team (enterprise)"         },
    ],
    case_studies: [
      { project: "K8s autoscaler with Wasm-based policy engine", result: "35% compute cost reduction over 60 days", duration: "7 days" },
    ],
  },
  {
    id:            "a6000002-0000-0000-0000-b2b2b2b2b2b2",
    name:          "Aisha M.",
    title:         "Backend + Kafka Engineer",
    match_score:   0.71,
    trust_score:   65,
    identity_tier: 1,
    rate_cents:    7800,
    roi_score:     62,
    outcomes: [
      { metric: "Data Latency",       value: "−70%",   client_type: "Event-driven startup"          },
      { metric: "Team Throughput",    value: "+28%",   client_type: "Fintech backend team"           },
    ],
    case_studies: [
      { project: "Kafka event bus for payment notifications",   result: "Reduced p99 latency from 420ms to 28ms",  duration: "10 days" },
    ],
  },
];

// ── Sidebar nav ────────────────────────────────────────────────────────────────

const SIDEBAR_NAV = [
  { label: "Dashboard",    href: "/dashboard"   },
  { label: "Marketplace",  href: "/marketplace" },
  { label: "Leaderboard",  href: "/leaderboard" },
  { label: "Matching",     href: "/matching"    },
  { label: "Profile",      href: "/profile"     },
];

const AI_TOOLS_NAV = [
  { label: "Scoping",      href: "/scoping"      },
  { label: "Outcomes",     href: "/outcomes",      active: true },
  { label: "Proposals",    href: "/proposals"    },
  { label: "Pricing Tool", href: "/pricing-tool" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtRate(c: number) { return `$${(c / 100).toFixed(0)}/hr`; }

function valueColor(v: string) {
  if (v.startsWith("+")) return "text-green-400";
  if (v.startsWith("−") || v.startsWith("-")) return "text-amber-400";
  return "text-zinc-300";
}

// ── OutcomeCard ───────────────────────────────────────────────────────────────

function OutcomeCard({ match, rank }: { match: OutcomeMatch; rank: number }) {
  const [open,        setOpen]        = useState(false);
  const [composing,   setComposing]   = useState(false);
  const [message,     setMessage]     = useState("");
  const [inviting,    setInviting]    = useState(false);
  const [invited,     setInvited]     = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  async function handleSend() {
    setInviting(true);
    setInviteError(null);
    try {
      await inviteToProject(match.id, undefined, message.trim() || undefined);
      setInvited(true);
      setComposing(false);
      setMessage("");
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Invite failed — try again");
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900/50 overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-zinc-900 transition-colors"
      >
        <span className="font-mono text-xs text-zinc-600 w-5 flex-shrink-0">{rank}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-xs font-medium text-zinc-100">{match.name}</p>
            <VettingBadge tier={match.identity_tier} compact />
          </div>
          <p className="font-mono text-[10px] text-zinc-500 mt-0.5">{match.title}</p>
        </div>

        {/* ROI score */}
        <div className="text-right flex-shrink-0">
          <p className="font-mono text-[10px] text-zinc-600 uppercase">ROI Score</p>
          <p className={`font-mono text-sm font-medium tabular-nums ${
            match.roi_score >= 80 ? "text-green-400" : match.roi_score >= 60 ? "text-amber-400" : "text-zinc-500"
          }`}>{match.roi_score}</p>
        </div>

        {/* Key outcome pill */}
        <div className="hidden sm:block flex-shrink-0">
          <span className={`font-mono text-xs font-medium tabular-nums ${valueColor(match.outcomes[0].value)}`}>
            {match.outcomes[0].value}
          </span>
          <p className="font-mono text-[9px] text-zinc-600">{match.outcomes[0].metric}</p>
        </div>

        <span className="font-mono text-xs text-zinc-500 flex-shrink-0 hidden sm:block">{fmtRate(match.rate_cents)}</span>

        {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />}
      </button>

      {/* Outcomes strip — always visible */}
      <div className="flex items-stretch border-t border-zinc-800/60 divide-x divide-zinc-800/60">
        {match.outcomes.map((o) => (
          <div key={o.metric} className="flex-1 px-3 py-2">
            <p className={`font-mono text-sm font-medium tabular-nums ${valueColor(o.value)}`}>{o.value}</p>
            <p className="font-mono text-[10px] text-zinc-500 mt-0.5 leading-tight">{o.metric}</p>
            <p className="font-mono text-[9px] text-zinc-700 truncate">{o.client_type}</p>
          </div>
        ))}
      </div>

      {/* Expanded: case studies + sub-scores */}
      {open && (
        <div className="border-t border-zinc-800 bg-zinc-950/50 p-4 space-y-4">
          {/* Case studies */}
          <div className="space-y-2">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Case Studies</p>
            {match.case_studies.map((cs, i) => (
              <div key={i} className="border border-zinc-800 rounded-sm p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-xs text-zinc-300 leading-relaxed">{cs.project}</p>
                  <span className="font-mono text-[10px] text-zinc-600 flex-shrink-0 border border-zinc-800 px-1.5 py-0.5 rounded-sm">
                    {cs.duration}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <ArrowUpRight className="w-3 h-3 text-green-500 flex-shrink-0" />
                  <p className="font-mono text-[10px] text-green-400 leading-relaxed">{cs.result}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Score bars */}
          <div className="space-y-2">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Match Breakdown</p>
            <SubScoreBar label="Overall Match"    score={Math.round(match.match_score * 100)} color="amber" />
            <SubScoreBar label="ROI Performance"  score={match.roi_score}                     color="green" />
            <SubScoreBar label="Trust Score"      score={match.trust_score}                   color={match.trust_score >= 70 ? "green" : "amber"} />
          </div>

          {/* Invite to Project — inline compose */}
          {invited ? (
            <div className="flex items-center gap-2 h-9 px-3 border border-green-900 bg-green-950/10 rounded-sm">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
              <span className="font-mono text-xs text-green-400">Invitation sent</span>
            </div>
          ) : composing ? (
            <div className="space-y-2">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Optional message to the talent…"
                maxLength={500}
                rows={3}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-sm px-3 py-2
                           font-mono text-xs text-zinc-200 placeholder-zinc-600
                           focus:outline-none focus:border-amber-700 resize-none"
              />
              <div className="flex gap-2">
                <button
                  disabled={inviting}
                  onClick={handleSend}
                  className="flex-1 h-8 rounded-sm border border-amber-900 bg-amber-950 text-amber-400
                             font-mono text-xs uppercase tracking-widest hover:border-amber-700 transition-colors
                             flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {inviting && <Loader2 className="w-3 h-3 animate-spin" />}
                  {inviting ? "Sending…" : "Send Invite"}
                </button>
                <button
                  onClick={() => { setComposing(false); setMessage(""); setInviteError(null); }}
                  className="h-8 px-3 rounded-sm border border-zinc-700 text-zinc-500
                             font-mono text-xs uppercase tracking-widest hover:border-zinc-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
              {inviteError && (
                <p className="font-mono text-[10px] text-red-400">{inviteError}</p>
              )}
            </div>
          ) : (
            <button
              onClick={() => setComposing(true)}
              className="w-full h-9 rounded-sm border border-amber-900 bg-amber-950 text-amber-400
                         font-mono text-xs uppercase tracking-widest hover:border-amber-700 transition-colors"
            >
              Invite to Project
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function OutcomesPage() {
  const sorted = [...DEMO_OUTCOMES].sort((a, b) => b.roi_score - a.roi_score);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      {/* Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-56 border-r border-zinc-800 bg-zinc-950 p-4 gap-6">
        <span className="font-mono text-xs text-zinc-500 uppercase tracking-widest">AiStaffApp</span>
        <nav className="flex flex-col gap-1">
          {SIDEBAR_NAV.map(({ label, href }) => (
            <Link key={label} href={href}
              className="px-3 py-2 rounded-sm font-mono text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
            >{label}</Link>
          ))}
        </nav>
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">AI Tools</p>
          {AI_TOOLS_NAV.map(({ label, href, active }) => (
            <Link key={label} href={href}
              className={`block px-3 py-1.5 rounded-sm font-mono text-xs transition-colors ${
                active ? "text-zinc-100 bg-zinc-800" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >{label}</Link>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-4 pb-20 lg:pb-4 max-w-3xl mx-auto w-full space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
              Outcome-Based Matching
            </h1>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">
              Match by ROI data — not just skills
            </p>
          </div>
          <TrendingUp className="w-5 h-5 text-amber-500" />
        </div>

        {/* Explanation banner */}
        <div className="border border-amber-900/40 bg-amber-950/10 rounded-sm p-3">
          <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-1">How this works</p>
          <p className="font-mono text-xs text-zinc-400 leading-relaxed">
            Each candidate is ranked by a composite ROI score built from verified past deployment metrics.
            Outcome data is sourced from completed engagements with DoD checklist finalized and escrow released.
          </p>
        </div>

        {/* Cards */}
        <div className="space-y-3">
          {sorted.map((m, i) => (
            <OutcomeCard key={m.id} match={m} rank={i + 1} />
          ))}
        </div>
      </main>

      {/* Mobile nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-16 flex items-center border-t border-zinc-800 bg-zinc-950">
        {[
          { label: "Dash",     href: "/dashboard"  },
          { label: "Market",   href: "/marketplace"},
          { label: "Matching", href: "/matching"   },
          { label: "Profile",  href: "/profile"    },
        ].map(({ label, href }) => (
          <Link key={label} href={href} className="nav-tab">
            <span className="text-[10px]">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
