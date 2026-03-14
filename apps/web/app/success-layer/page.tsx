"use client";

import { useState } from "react";
import Link from "next/link";
import { Star, CheckCircle2, Circle, ArrowRight, User, Repeat2, ClipboardCheck, Zap } from "lucide-react";

// ── Types & demo data ─────────────────────────────────────────────────────────

interface OnboardingStep {
  id:        string;
  label:     string;
  detail:    string;
  completed: boolean;
  owner:     "talent" | "client" | "platform";
}

interface QaCheck {
  id:        string;
  milestone: string;
  item:      string;
  status:    "passed" | "failed" | "pending";
  note:      string;
}

interface Csm {
  id:       string;
  name:     string;
  title:    string;
  response: string;
  placements: number;
  available: boolean;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: "ob1", label: "Welcome message sent",         detail: "Platform auto-sends intro email to both parties",           completed: true,  owner: "platform" },
  { id: "ob2", label: "Kickoff call scheduled",       detail: "15–30 min video call to align on scope and expectations",   completed: true,  owner: "talent"   },
  { id: "ob3", label: "Project brief confirmed",      detail: "Client confirms brief doc uploaded; talent acknowledges",   completed: true,  owner: "client"   },
  { id: "ob4", label: "Shared workspace set up",      detail: "Collab channel, file share, and GitHub/Figma linked",       completed: true,  owner: "talent"   },
  { id: "ob5", label: "DoD checklist agreed",         detail: "Both parties review and sign-off on Definition of Done",   completed: true,  owner: "platform" },
  { id: "ob6", label: "Escrow funded",                detail: "Client funds first milestone escrow",                       completed: true,  owner: "client"   },
  { id: "ob7", label: "Work diary access granted",    detail: "Client invited to view AI-summarised work diaries",        completed: false, owner: "talent"   },
  { id: "ob8", label: "Communication rhythm agreed",  detail: "Async updates cadence confirmed (e.g. daily video diary)", completed: false, owner: "talent"   },
];

const QA_CHECKS: QaCheck[] = [
  { id: "qa1", milestone: "Phase 1", item: "Requirements doc covers all brief items",    status: "passed",  note: "All 12 requirements addressed"              },
  { id: "qa2", milestone: "Phase 1", item: "Env audit report complete",                  status: "passed",  note: "3 issues noted, all resolved"               },
  { id: "qa3", milestone: "Phase 2", item: "agent.wasm passes Wasm sandbox smoke tests", status: "passed",  note: "24/24 automated tests green"                },
  { id: "qa4", milestone: "Phase 2", item: "Credential injection secure",                status: "passed",  note: "No secrets outside host fn boundary"        },
  { id: "qa5", milestone: "Phase 3", item: "JWT refresh logic unit tested",              status: "passed",  note: "12 integration tests, 0 failures"           },
  { id: "qa6", milestone: "Phase 3", item: "Audit log append-only verified",             status: "pending", note: "Awaiting Phase 3 completion"                },
  { id: "qa7", milestone: "Phase 3", item: "Load test: 500 rps sustained 60s",          status: "pending", note: "Scheduled for milestone handoff"            },
  { id: "qa8", milestone: "Phase 4", item: "Runbook reviewed by client",                 status: "pending", note: "Pending Phase 4 start"                      },
];

const DEMO_CSMS: Csm[] = [
  {
    id: "csm-1", name: "Sophie L.", title: "Client Success Manager — AI/Backend",
    response: "< 2h", placements: 94, available: true,
  },
  {
    id: "csm-2", name: "Raj N.", title: "Client Success Manager — Infra/DevOps",
    response: "< 4h", placements: 67, available: true,
  },
];

// ── Sidebar nav ───────────────────────────────────────────────────────────────

const SIDEBAR_NAV = [
  { label: "Dashboard",   href: "/dashboard"   },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Matching",    href: "/matching"    },
  { label: "Profile",     href: "/profile"     },
];

const WORKSPACE_NAV = [
  { label: "Work Diaries",  href: "/work-diaries"               },
  { label: "Async Collab",  href: "/async-collab"               },
  { label: "Collaboration", href: "/collab"                     },
  { label: "Success Layer", href: "/success-layer", active: true },
  { label: "Quality Gate",  href: "/quality-gate"               },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const OWNER_COLOR = { talent: "text-sky-400", client: "text-purple-400", platform: "text-zinc-500" };
const QA_STATUS_MAP = {
  passed:  { label: "Passed",  color: "text-green-400", border: "border-green-800", icon: CheckCircle2 },
  failed:  { label: "Failed",  color: "text-red-400",   border: "border-red-800",   icon: CheckCircle2 },
  pending: { label: "Pending", color: "text-zinc-500",  border: "border-zinc-700",  icon: Circle       },
};

// ── OnboardingChecklist ───────────────────────────────────────────────────────

function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const done  = steps.filter(s => s.completed).length;
  const total = steps.length;
  const pct   = Math.round((done / total) * 100);

  return (
    <div className="space-y-3">
      {/* Progress */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-zinc-500">{done}/{total} steps complete</span>
        <span className={`font-mono text-[10px] font-medium ${pct === 100 ? "text-green-400" : "text-amber-400"}`}>{pct}%</span>
      </div>
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full bg-amber-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>

      {/* Steps */}
      <div className="space-y-1.5">
        {steps.map(step => (
          <div key={step.id} className={`flex items-start gap-2.5 border rounded-sm px-2.5 py-2 ${
            step.completed ? "border-zinc-800 bg-zinc-900/40" : "border-amber-900/40 bg-amber-950/5"
          }`}>
            <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${step.completed ? "text-green-400" : "text-zinc-700"}`} />
            <div className="flex-1 min-w-0">
              <p className={`font-mono text-[10px] font-medium ${step.completed ? "text-zinc-300" : "text-zinc-400"}`}>{step.label}</p>
              <p className="font-mono text-[9px] text-zinc-600 leading-relaxed mt-0.5">{step.detail}</p>
            </div>
            <span className={`font-mono text-[9px] flex-shrink-0 ${OWNER_COLOR[step.owner]}`}>{step.owner}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── QaChecklist ───────────────────────────────────────────────────────────────

function QaChecklist({ checks }: { checks: QaCheck[] }) {
  const milestones = [...new Set(checks.map(c => c.milestone))];

  return (
    <div className="space-y-3">
      {milestones.map(ms => {
        const items = checks.filter(c => c.milestone === ms);
        const allPassed = items.every(i => i.status === "passed");
        return (
          <div key={ms}>
            <div className="flex items-center gap-2 mb-1.5">
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{ms}</p>
              {allPassed && (
                <span className="font-mono text-[9px] text-green-400 border border-green-900 px-1 rounded-sm">All Passed</span>
              )}
            </div>
            <div className="space-y-1">
              {items.map(c => {
                const { color, border, icon: Icon } = QA_STATUS_MAP[c.status];
                return (
                  <div key={c.id} className="flex items-start gap-2 border border-zinc-800/60 rounded-sm px-2.5 py-1.5">
                    <Icon className={`w-3 h-3 flex-shrink-0 mt-0.5 ${color}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`font-mono text-[10px] ${c.status === "passed" ? "text-zinc-300" : "text-zinc-500"}`}>{c.item}</p>
                      <p className="font-mono text-[9px] text-zinc-600">{c.note}</p>
                    </div>
                    <span className={`font-mono text-[9px] uppercase tracking-widest flex-shrink-0 ${color}`}>{c.status}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SuccessLayerPage() {
  const [tab, setTab] = useState<"onboarding" | "qa" | "csm" | "retention">("onboarding");
  const [csmRequested, setCsmRequested] = useState<string | null>(null);

  const projectValue = 500000; // cents
  const isHighValue  = projectValue >= 300000;

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
          <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">Workspace</p>
          {WORKSPACE_NAV.map(({ label, href, active }) => (
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
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">Post-Hire Success</h1>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">Onboarding · QA · Client Success · Retention</p>
          </div>
          <Star className="w-5 h-5 text-amber-500" />
        </div>

        {/* High-value badge */}
        {isHighValue && (
          <div className="border border-amber-900/50 bg-amber-950/10 rounded-sm p-3 flex items-center gap-3">
            <Zap className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="font-mono text-xs text-zinc-400">
              This is a <span className="text-amber-400">high-value project ($5,000+)</span> — a Client Success Manager is available at no extra cost.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800 flex-wrap">
          {[
            { key: "onboarding" as const, label: "Onboarding"    },
            { key: "qa"         as const, label: "Milestone QA"  },
            { key: "csm"        as const, label: "Success Mgr"   },
            { key: "retention"  as const, label: "Retention"     },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-2 font-mono text-xs border-b-2 transition-colors ${
                tab === key ? "border-amber-500 text-amber-400" : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >{label}</button>
          ))}
        </div>

        {tab === "onboarding" && (
          <div className="space-y-3">
            <div className="border border-zinc-800 bg-zinc-900/40 rounded-sm p-3">
              <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-1">Onboarding Template</p>
              <p className="font-mono text-xs text-zinc-400 leading-relaxed">
                Standard 8-step onboarding checklist auto-applied to every engagement. Ensures both parties are
                aligned before work begins — reducing mid-project misunderstandings by 60%.
              </p>
            </div>
            <OnboardingChecklist steps={ONBOARDING_STEPS} />
          </div>
        )}

        {tab === "qa" && (
          <div className="space-y-3">
            <div className="border border-zinc-800 bg-zinc-900/40 rounded-sm p-3">
              <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-1">Milestone QA Gate</p>
              <p className="font-mono text-xs text-zinc-400 leading-relaxed">
                Each milestone must pass QA checks before escrow is released. The Autonomous Quality Gate
                (AI agent) pre-screens deliverables; a human reviewer confirms for high-value milestones.
              </p>
            </div>
            <QaChecklist checks={QA_CHECKS} />
          </div>
        )}

        {tab === "csm" && (
          <div className="space-y-3">
            <div className="border border-zinc-800 bg-zinc-900/40 rounded-sm p-3">
              <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-1">Client Success Managers</p>
              <p className="font-mono text-xs text-zinc-400 leading-relaxed">
                Available on projects $3,000+ at no extra cost. CSMs mediate disputes, review milestone QA,
                and proactively surface risks. Assigned CSM has full read access to the project timeline.
              </p>
            </div>

            {DEMO_CSMS.map(csm => (
              <div key={csm.id} className="border border-zinc-700 rounded-sm p-3 bg-zinc-900/50">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-sm bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-zinc-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-mono text-xs font-medium text-zinc-100">{csm.name}</p>
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      </div>
                      <p className="font-mono text-[10px] text-zinc-500">{csm.title}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[9px] text-zinc-600 uppercase">Response</p>
                    <p className="font-mono text-xs text-green-400">{csm.response}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 mt-2.5">
                  <div>
                    <p className="font-mono text-[9px] text-zinc-600 uppercase">Placements</p>
                    <p className="font-mono text-xs text-zinc-300">{csm.placements}</p>
                  </div>
                  <div className="ml-auto">
                    {csmRequested === csm.id
                      ? <p className="font-mono text-[10px] text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Requested</p>
                      : (
                        <button onClick={() => setCsmRequested(csm.id)}
                          className="h-8 px-3 rounded-sm border border-amber-900 bg-amber-950/30 text-amber-400
                                     font-mono text-[9px] uppercase tracking-widest hover:border-amber-700 transition-colors">
                          Request CSM
                        </button>
                      )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "retention" && (
          <div className="space-y-3">
            <div className="border border-zinc-800 rounded-sm p-3 space-y-3">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Project Health</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "On-Time Delivery",    value: "93%",  color: "text-green-400"  },
                  { label: "Client Satisfaction", value: "4.8★", color: "text-amber-400"  },
                  { label: "Revision Rounds",     value: "1.2x", color: "text-zinc-300"   },
                  { label: "Repeat Hire Rate",    value: "68%",  color: "text-sky-400"    },
                ].map(({ label, value, color }) => (
                  <div key={label} className="border border-zinc-800 rounded-sm p-2.5">
                    <p className="font-mono text-[9px] text-zinc-600 uppercase">{label}</p>
                    <p className={`font-mono text-base font-medium tabular-nums mt-0.5 ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-green-900/40 bg-green-950/10 rounded-sm p-3">
              <div className="flex items-center gap-2 mb-2">
                <Repeat2 className="w-4 h-4 text-green-400" />
                <p className="font-mono text-[10px] text-green-500 uppercase tracking-widest">Repeat Engagement Offer</p>
              </div>
              <p className="font-mono text-xs text-zinc-400 leading-relaxed mb-3">
                Project completes in ~4 days. Lock in Marcus T. for a follow-on scope at the same rate —
                no re-matching fee. Previous work context retained automatically.
              </p>
              <button className="flex items-center gap-1.5 h-9 px-3 rounded-sm border border-green-800 bg-green-950/30 text-green-400
                                 font-mono text-xs uppercase tracking-widest hover:border-green-600 transition-colors">
                <ArrowRight className="w-3.5 h-3.5" /> Extend Engagement
              </button>
            </div>

            <div className="border border-zinc-800 rounded-sm p-3">
              <div className="flex items-center gap-2 mb-2">
                <ClipboardCheck className="w-4 h-4 text-zinc-500" />
                <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Post-Project Checklist</p>
              </div>
              <div className="space-y-1.5">
                {[
                  { item: "Leave talent review",          done: false },
                  { item: "Download final deliverables",  done: false },
                  { item: "Archive project workspace",    done: false },
                  { item: "Confirm warranty period active (7d)", done: true },
                ].map(({ item, done }) => (
                  <div key={item} className="flex items-center gap-2">
                    <CheckCircle2 className={`w-3 h-3 flex-shrink-0 ${done ? "text-green-400" : "text-zinc-700"}`} />
                    <span className={`font-mono text-[10px] ${done ? "text-zinc-400" : "text-zinc-500"}`}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Mobile nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-16 flex items-center border-t border-zinc-800 bg-zinc-950">
        {[
          { label: "Dash",    href: "/dashboard"   },
          { label: "Market",  href: "/marketplace" },
          { label: "Matching",href: "/matching"    },
          { label: "Profile", href: "/profile"     },
        ].map(({ label, href }) => (
          <Link key={label} href={href} className="nav-tab">
            <span className="text-[10px]">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
