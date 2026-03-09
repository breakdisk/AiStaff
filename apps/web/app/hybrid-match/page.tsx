"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, Bot, User, ShieldCheck, ArrowRight, CheckCircle2, Clock, Star } from "lucide-react";
import { VettingBadge } from "@/components/VettingBadge";
import { SubScoreBar } from "@/components/SubScoreBar";

// ── Demo data ────────────────────────────────────────────────────────────────

interface AiCandidate {
  id:             string;
  name:           string;
  title:          string;
  match_score:    number;   // 0–1
  trust_score:    number;   // 0–100
  identity_tier:  0 | 1 | 2;
  rate_cents:     number;
  trial_rate_cents: number; // discounted trial rate
  skills:         string[];
  sub_scores:     { skills: number; past_work: number; behavior: number };
  trial_available: boolean;
}

const AI_SHORTLIST: AiCandidate[] = [
  {
    id:            "hm-001",
    name:          "Marcus T.",
    title:         "Senior Rust / Wasm Engineer",
    match_score:   0.94,
    trust_score:   94,
    identity_tier: 2,
    rate_cents:    18500,
    trial_rate_cents: 14000,
    skills:        ["Rust", "Wasm", "Kafka", "Axum"],
    sub_scores:    { skills: 96, past_work: 91, behavior: 89 },
    trial_available: true,
  },
  {
    id:            "hm-002",
    name:          "Lena K.",
    title:         "ML Systems Architect",
    match_score:   0.87,
    trust_score:   88,
    identity_tier: 2,
    rate_cents:    21000,
    trial_rate_cents: 16000,
    skills:        ["Python", "PyTorch", "RAG", "MLOps"],
    sub_scores:    { skills: 88, past_work: 90, behavior: 82 },
    trial_available: true,
  },
  {
    id:            "hm-003",
    name:          "Diego R.",
    title:         "DevOps + Wasm Specialist",
    match_score:   0.78,
    trust_score:   72,
    identity_tier: 1,
    rate_cents:    9500,
    trial_rate_cents: 7500,
    skills:        ["K8s", "Terraform", "Wasm", "Grafana"],
    sub_scores:    { skills: 78, past_work: 75, behavior: 80 },
    trial_available: true,
  },
];

interface HumanRecruiter {
  id:         string;
  name:       string;
  speciality: string;
  placements: number;
  avg_days:   number;
  fee_pct:    number;     // % of first engagement value
  available:  boolean;
}

const RECRUITERS: HumanRecruiter[] = [
  {
    id:         "rec-001",
    name:       "Priya S.",
    speciality: "AI/ML · Rust · Systems",
    placements: 148,
    avg_days:   9,
    fee_pct:    8,
    available:  true,
  },
  {
    id:         "rec-002",
    name:       "James W.",
    speciality: "DevOps · Cloud · Kubernetes",
    placements: 93,
    avg_days:   12,
    fee_pct:    7,
    available:  true,
  },
  {
    id:         "rec-003",
    name:       "Amara O.",
    speciality: "Robotics · Embedded · ROS2",
    placements: 61,
    avg_days:   11,
    fee_pct:    9,
    available:  false,
  },
];

// ── Sidebar nav ──────────────────────────────────────────────────────────────

const SIDEBAR_NAV = [
  { label: "Dashboard",    href: "/dashboard"   },
  { label: "Marketplace",  href: "/marketplace" },
  { label: "Leaderboard",  href: "/leaderboard" },
  { label: "Matching",     href: "/matching"    },
  { label: "Profile",      href: "/profile"     },
];

const AI_TOOLS_NAV = [
  { label: "Scoping",      href: "/scoping"      },
  { label: "Outcomes",     href: "/outcomes"     },
  { label: "Proposals",    href: "/proposals"    },
  { label: "Pricing Tool", href: "/pricing-tool" },
  { label: "Hybrid Match", href: "/hybrid-match", active: true },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtRate(c: number) { return `$${(c / 100).toFixed(0)}/hr`; }

// ── TrialCard ─────────────────────────────────────────────────────────────────

function TrialCard({ candidate, onStartTrial }: {
  candidate: AiCandidate;
  onStartTrial: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const score = Math.round(candidate.match_score * 100);

  return (
    <div className={`border rounded-sm overflow-hidden transition-colors ${
      score >= 90 ? "border-amber-800/60 bg-amber-950/5" : "border-zinc-800 bg-zinc-900/50"
    }`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-3">
        {/* Rank circle */}
        <div className={`w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0 border font-mono text-xs font-medium tabular-nums ${
          score >= 90
            ? "border-amber-700 bg-amber-950/40 text-amber-400"
            : "border-zinc-700 bg-zinc-800 text-zinc-400"
        }`}>
          {score}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-xs font-medium text-zinc-100">{candidate.name}</p>
            <VettingBadge tier={candidate.identity_tier} compact />
            {score >= 90 && (
              <span className="font-mono text-[9px] px-1.5 py-0.5 border border-amber-700 text-amber-400 rounded-sm uppercase tracking-widest">
                AI Pick
              </span>
            )}
          </div>
          <p className="font-mono text-[10px] text-zinc-500 mt-0.5">{candidate.title}</p>
        </div>

        <div className="flex-shrink-0 text-right">
          <p className="font-mono text-[10px] text-zinc-600">Trial</p>
          <p className="font-mono text-xs font-medium text-sky-400 tabular-nums">
            {fmtRate(candidate.trial_rate_cents)}
          </p>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="font-mono text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors px-1"
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* Skills strip */}
      <div className="flex gap-1.5 px-3 pb-2 flex-wrap">
        {candidate.skills.map((s) => (
          <span key={s} className="font-mono text-[9px] text-zinc-500 border border-zinc-800 px-1.5 py-0.5 rounded-sm">
            {s}
          </span>
        ))}
      </div>

      {/* Expanded: sub-scores + trial CTA */}
      {expanded && (
        <div className="border-t border-zinc-800 bg-zinc-950/50 p-3 space-y-3">
          <div className="space-y-2">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">AI Match Breakdown</p>
            <SubScoreBar label="Skills Alignment"  score={candidate.sub_scores.skills}    color="amber" />
            <SubScoreBar label="Past Work"         score={candidate.sub_scores.past_work}  color="green" />
            <SubScoreBar label="Client Behavior"   score={candidate.sub_scores.behavior}   color="sky"   />
          </div>

          {/* Rate comparison */}
          <div className="grid grid-cols-2 gap-2">
            <div className="border border-zinc-800 rounded-sm p-2">
              <p className="font-mono text-[9px] text-zinc-600 uppercase">Standard Rate</p>
              <p className="font-mono text-sm font-medium text-zinc-400 tabular-nums mt-0.5">{fmtRate(candidate.rate_cents)}</p>
            </div>
            <div className="border border-sky-900/50 rounded-sm p-2 bg-sky-950/10">
              <p className="font-mono text-[9px] text-sky-500 uppercase">Trial Rate (7–14d)</p>
              <p className="font-mono text-sm font-medium text-sky-400 tabular-nums mt-0.5">{fmtRate(candidate.trial_rate_cents)}</p>
            </div>
          </div>

          <button
            onClick={() => onStartTrial(candidate.id)}
            className="w-full h-9 rounded-sm border border-sky-800 bg-sky-950/30 text-sky-400
                       font-mono text-xs uppercase tracking-widest hover:border-sky-600 transition-colors
                       flex items-center justify-center gap-2"
          >
            <Clock className="w-3.5 h-3.5" />
            Start {candidate.trial_rate_cents < candidate.rate_cents ? "Discounted " : ""}Trial
          </button>
        </div>
      )}
    </div>
  );
}

// ── RecruiterCard ─────────────────────────────────────────────────────────────

function RecruiterCard({ recruiter, onEngage }: {
  recruiter: HumanRecruiter;
  onEngage:  (id: string) => void;
}) {
  return (
    <div className={`border rounded-sm p-3 transition-colors ${
      recruiter.available
        ? "border-zinc-700 bg-zinc-900/50"
        : "border-zinc-800 bg-zinc-900/20 opacity-50"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-sm bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-zinc-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-mono text-xs font-medium text-zinc-100">{recruiter.name}</p>
              {recruiter.available && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" title="Available" />
              )}
            </div>
            <p className="font-mono text-[10px] text-zinc-500 mt-0.5">{recruiter.speciality}</p>
          </div>
        </div>
        <span className="font-mono text-[9px] text-zinc-600 border border-zinc-800 px-1.5 py-0.5 rounded-sm flex-shrink-0">
          {recruiter.fee_pct}% fee
        </span>
      </div>

      <div className="flex items-center gap-4 mt-2.5">
        <div>
          <p className="font-mono text-[9px] text-zinc-600 uppercase">Placements</p>
          <p className="font-mono text-xs font-medium text-zinc-300 tabular-nums">{recruiter.placements}</p>
        </div>
        <div>
          <p className="font-mono text-[9px] text-zinc-600 uppercase">Avg. Time-to-Fill</p>
          <p className="font-mono text-xs font-medium text-zinc-300 tabular-nums">{recruiter.avg_days} days</p>
        </div>
        <div className="ml-auto">
          {recruiter.available ? (
            <button
              onClick={() => onEngage(recruiter.id)}
              className="h-8 px-3 rounded-sm border border-zinc-700 text-zinc-300
                         font-mono text-[10px] uppercase tracking-widest
                         hover:border-zinc-500 hover:text-zinc-100 transition-colors"
            >
              Engage
            </button>
          ) : (
            <span className="font-mono text-[10px] text-zinc-600">Unavailable</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

type Tab = "ai" | "human" | "trial";

export default function HybridMatchPage() {
  const [tab,         setTab]         = useState<Tab>("ai");
  const [trialActive, setTrialActive] = useState<string | null>(null);
  const [recruiterMsg, setRecruiterMsg] = useState<string | null>(null);

  function handleStartTrial(id: string) {
    setTrialActive(id);
    setTab("trial");
  }

  function handleEngageRecruiter(id: string) {
    setRecruiterMsg(id);
  }

  const TABS: { key: Tab; icon: React.ElementType; label: string }[] = [
    { key: "ai",    icon: Bot,   label: "AI Shortlist" },
    { key: "human", icon: Users, label: "Human Recruiter" },
    { key: "trial", icon: Clock, label: "Active Trials" },
  ];

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
          <p className="font-mono text-[10px] text-zinc-700 uppercase tracking-widest px-3">AI Tools</p>
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
              Hybrid Matching
            </h1>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">
              AI shortlist · Human recruiters · Paid trials
            </p>
          </div>
          <Users className="w-5 h-5 text-amber-500" />
        </div>

        {/* How it works */}
        <div className="border border-zinc-800 rounded-sm p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { step: "1", icon: Bot,         title: "AI Shortlist",     desc: "Algorithm ranks the top 3 candidates by match score, skills, and past ROI." },
            { step: "2", icon: Users,        title: "Human Recruiter",  desc: "Optionally add a specialist recruiter who vets shortlist and sourcing." },
            { step: "3", icon: ShieldCheck,  title: "7–14d Paid Trial", desc: "Start a discounted paid trial with a money-back guarantee if it doesn't fit." },
          ].map(({ step, icon: Icon, title, desc }) => (
            <div key={step} className="flex gap-2.5">
              <div className="w-6 h-6 rounded-sm border border-zinc-700 bg-zinc-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div>
                <p className="font-mono text-xs font-medium text-zinc-200">{title}</p>
                <p className="font-mono text-[10px] text-zinc-500 leading-relaxed mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800">
          {TABS.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 font-mono text-xs border-b-2 transition-colors ${
                tab === key
                  ? "border-amber-500 text-amber-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {key === "trial" && trialActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-0.5" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "ai" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">AI-ranked shortlist</p>
              <span className="font-mono text-[10px] text-zinc-600">3 candidates · updated 2m ago</span>
            </div>

            {AI_SHORTLIST.map((c) => (
              <TrialCard key={c.id} candidate={c} onStartTrial={handleStartTrial} />
            ))}

            <div className="border border-zinc-800 rounded-sm p-3">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Trial Terms</p>
              <ul className="space-y-1.5">
                {[
                  "7–14 calendar days at the discounted trial rate shown above",
                  "Money-back guarantee if the engagement isn't a fit after day 3",
                  "Full escrow protection — funds held until trial milestone agreed",
                  "Convert to long-term engagement at any time with zero penalty",
                ].map((t, i) => (
                  <li key={i} className="flex items-start gap-2 font-mono text-[10px] text-zinc-400">
                    <CheckCircle2 className="w-3 h-3 text-zinc-600 flex-shrink-0 mt-0.5" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {tab === "human" && (
          <div className="space-y-3">
            <div className="border border-zinc-800 bg-zinc-900/40 rounded-sm p-3">
              <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-1">Why add a recruiter?</p>
              <p className="font-mono text-xs text-zinc-400 leading-relaxed">
                Human recruiters provide sourcing beyond the platform, conduct live reference checks,
                and negotiate contract terms. Their fee is a one-time % of the first engagement value —
                no ongoing subscription.
              </p>
            </div>

            <div className="space-y-2">
              {RECRUITERS.map((r) => (
                <RecruiterCard key={r.id} recruiter={r} onEngage={handleEngageRecruiter} />
              ))}
            </div>

            {recruiterMsg && (
              <div className="border border-green-900 bg-green-950/10 rounded-sm p-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                <p className="font-mono text-xs text-green-400">
                  Request sent — recruiter will contact you within 4 business hours.
                </p>
              </div>
            )}

            <div className="border border-zinc-800 rounded-sm p-3">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Recruiter SLA</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "First Response",  value: "< 4hrs"  },
                  { label: "Shortlist Ready", value: "2 days"  },
                  { label: "Avg. Placement",  value: "10 days" },
                ].map(({ label, value }) => (
                  <div key={label} className="border border-zinc-800 rounded-sm p-2">
                    <p className="font-mono text-[9px] text-zinc-600 uppercase">{label}</p>
                    <p className="font-mono text-sm font-medium text-zinc-300 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "trial" && (
          <div className="space-y-3">
            {trialActive ? (
              <>
                {(() => {
                  const c = AI_SHORTLIST.find((x) => x.id === trialActive)!;
                  return (
                    <div className="border border-sky-800/60 rounded-sm bg-sky-950/10 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-sky-800/40">
                        <Clock className="w-3.5 h-3.5 text-sky-400" />
                        <p className="font-mono text-xs font-medium text-sky-300">Trial Active</p>
                        <span className="ml-auto font-mono text-[10px] text-sky-600">7–14 days</span>
                      </div>
                      <div className="p-3 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <p className="font-mono text-xs font-medium text-zinc-100">{c.name}</p>
                            <p className="font-mono text-[10px] text-zinc-500">{c.title}</p>
                          </div>
                          <VettingBadge tier={c.identity_tier} compact />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="border border-zinc-800 rounded-sm p-2">
                            <p className="font-mono text-[9px] text-zinc-600 uppercase">Trial Rate</p>
                            <p className="font-mono text-sm font-medium text-sky-400">{fmtRate(c.trial_rate_cents)}</p>
                          </div>
                          <div className="border border-zinc-800 rounded-sm p-2">
                            <p className="font-mono text-[9px] text-zinc-600 uppercase">Guarantee</p>
                            <p className="font-mono text-sm font-medium text-green-400">Day 3+</p>
                          </div>
                        </div>

                        {/* Timeline */}
                        <div>
                          <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Trial Milestones</p>
                          <div className="space-y-2">
                            {[
                              { day: "Day 1",   label: "Kickoff call + env setup",      done: true  },
                              { day: "Day 3",   label: "Money-back guarantee window closes", done: false },
                              { day: "Day 7",   label: "Mid-trial review checkpoint",    done: false },
                              { day: "Day 14",  label: "Trial ends — convert or exit",   done: false },
                            ].map(({ day, label, done }) => (
                              <div key={day} className="flex items-center gap-2.5">
                                <div className={`w-4 h-4 rounded-sm flex items-center justify-center flex-shrink-0 border ${
                                  done ? "border-green-700 bg-green-950/40" : "border-zinc-700 bg-zinc-800"
                                }`}>
                                  {done && <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />}
                                </div>
                                <span className="font-mono text-[10px] text-zinc-500 w-10 flex-shrink-0">{day}</span>
                                <span className={`font-mono text-[10px] ${done ? "text-zinc-300" : "text-zinc-500"}`}>{label}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button className="flex-1 h-9 rounded-sm border border-green-800 bg-green-950/30 text-green-400
                                             font-mono text-[10px] uppercase tracking-widest hover:border-green-600 transition-colors
                                             flex items-center justify-center gap-1.5">
                            <ArrowRight className="w-3.5 h-3.5" />
                            Convert to Engagement
                          </button>
                          <button
                            onClick={() => { setTrialActive(null); setTab("ai"); }}
                            className="h-9 px-3 rounded-sm border border-zinc-700 text-zinc-500
                                       font-mono text-[10px] uppercase tracking-widest hover:border-zinc-600 transition-colors"
                          >
                            End Trial
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Rating card */}
                <div className="border border-zinc-800 rounded-sm p-3">
                  <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Early Impressions</p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star key={star} className="w-5 h-5 text-amber-500 fill-amber-500" />
                    ))}
                  </div>
                  <p className="font-mono text-[10px] text-zinc-600 mt-1">Rating saved — influences leaderboard score</p>
                </div>
              </>
            ) : (
              <div className="border border-zinc-800 rounded-sm p-6 text-center">
                <Clock className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                <p className="font-mono text-xs text-zinc-500">No active trials.</p>
                <p className="font-mono text-[10px] text-zinc-700 mt-1">
                  Start a trial from the AI Shortlist tab.
                </p>
                <button
                  onClick={() => setTab("ai")}
                  className="mt-4 h-8 px-4 rounded-sm border border-zinc-700 text-zinc-400
                             font-mono text-[10px] uppercase tracking-widest hover:border-zinc-500 transition-colors"
                >
                  View Shortlist
                </button>
              </div>
            )}
          </div>
        )}
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
