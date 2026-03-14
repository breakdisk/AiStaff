"use client";

import { useState } from "react";
import {
  Clock, CheckCircle, AlertTriangle, Plus, ChevronDown,
  Calendar, Flame, Minus, Bell,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type MilestoneStatus = "overdue" | "today" | "soon" | "later" | "done";
type NotifChannel    = "email" | "in-app" | "sms";

interface Milestone {
  id:           string;
  project:      string;
  milestone:    string;
  dueDate:      string;          // ISO date string
  daysRemaining:number;          // negative = overdue
  completionPct:number;
  deploymentId: string;
  status:       MilestoneStatus;
  slaBreached:  boolean;
  done:         boolean;
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_MILESTONES: Milestone[] = [
  {
    id: "m-001", project: "CRM Connector v3", milestone: "API Integration Review",
    dueDate: "2026-03-08", daysRemaining: 0, completionPct: 85,
    deploymentId: "dep-01J9X2Z3", status: "today", slaBreached: false, done: false,
  },
  {
    id: "m-002", project: "DataSync Agent v2.1", milestone: "Smoke Test Sign-Off",
    dueDate: "2026-03-06", daysRemaining: -2, completionPct: 60,
    deploymentId: "dep-02A3B4C5", status: "overdue", slaBreached: true, done: false,
  },
  {
    id: "m-003", project: "ML Pipeline Agent", milestone: "Dataset Validation",
    dueDate: "2026-03-10", daysRemaining: 2, completionPct: 40,
    deploymentId: "dep-03C5D6E7", status: "soon", slaBreached: false, done: false,
  },
  {
    id: "m-004", project: "ML Pipeline Agent", milestone: "Model Endpoint Deployment",
    dueDate: "2026-03-13", daysRemaining: 5, completionPct: 10,
    deploymentId: "dep-03C5D6E7", status: "soon", slaBreached: false, done: false,
  },
  {
    id: "m-005", project: "RoboArm Controller", milestone: "Kinematic Calibration",
    dueDate: "2026-03-20", daysRemaining: 12, completionPct: 0,
    deploymentId: "dep-04E7F8G9", status: "later", slaBreached: false, done: false,
  },
  {
    id: "m-006", project: "RoboArm Controller", milestone: "Safety Protocol Audit",
    dueDate: "2026-03-25", daysRemaining: 17, completionPct: 0,
    deploymentId: "dep-04E7F8G9", status: "later", slaBreached: false, done: false,
  },
  {
    id: "m-007", project: "CRM Connector v2", milestone: "Final QA Handoff",
    dueDate: "2026-02-28", daysRemaining: -8, completionPct: 100,
    deploymentId: "dep-00X1Y2Z3", status: "done", slaBreached: false, done: true,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function urgencyStyle(m: Milestone): { border: string; text: string; bg: string; icon: React.ReactNode } {
  if (m.done)             return { border: "border-zinc-700", text: "text-zinc-500", bg: "", icon: <CheckCircle className="w-3.5 h-3.5 text-green-500" /> };
  if (m.status === "overdue") return { border: "border-red-900", text: "text-red-400", bg: "bg-red-950/30", icon: <Flame className="w-3.5 h-3.5 text-red-400" /> };
  if (m.status === "today")   return { border: "border-amber-900", text: "text-amber-400", bg: "bg-amber-950/20", icon: <Clock className="w-3.5 h-3.5 text-amber-400" /> };
  if (m.status === "soon")    return { border: "border-amber-900/60", text: "text-amber-500", bg: "", icon: <Clock className="w-3.5 h-3.5 text-amber-500" /> };
  return { border: "border-zinc-800", text: "text-zinc-400", bg: "", icon: <Calendar className="w-3.5 h-3.5 text-zinc-500" /> };
}

function daysLabel(days: number, done: boolean): string {
  if (done)       return "Completed";
  if (days === 0) return "Due today";
  if (days < 0)   return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  return `${days} day${days === 1 ? "" : "s"} remaining`;
}

function ProgressBar({ pct, overdue }: { pct: number; overdue: boolean }) {
  const color = overdue ? "bg-red-600" : pct >= 75 ? "bg-green-600" : pct >= 40 ? "bg-amber-500" : "bg-zinc-600";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[10px] text-zinc-500 tabular-nums w-6 text-right">{pct}%</span>
    </div>
  );
}

function MilestoneRow({
  milestone,
  onComplete,
}: {
  milestone: Milestone;
  onComplete: (id: string) => void;
}) {
  const u = urgencyStyle(milestone);

  return (
    <div className={`border rounded-sm p-3 space-y-2 transition-all ${u.border} ${u.bg} ${milestone.done ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="mt-0.5 flex-shrink-0">{u.icon}</span>
          <div className="min-w-0">
            <p className={`font-mono text-xs font-medium truncate ${milestone.done ? "line-through text-zinc-600" : u.text}`}>
              {milestone.milestone}
            </p>
            <p className="font-mono text-[10px] text-zinc-500 truncate">{milestone.project}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {milestone.slaBreached && (
            <span className="font-mono text-[9px] px-1 py-0.5 rounded-sm border border-red-900 text-red-400">SLA BREACH</span>
          )}
          <span className={`font-mono text-[10px] tabular-nums ${u.text}`}>
            {daysLabel(milestone.daysRemaining, milestone.done)}
          </span>
        </div>
      </div>

      <ProgressBar pct={milestone.completionPct} overdue={milestone.status === "overdue"} />

      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-zinc-600">
          Due {milestone.dueDate} · {milestone.deploymentId}
        </span>
        {!milestone.done && (
          <button
            onClick={() => onComplete(milestone.id)}
            className="flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-sm
                       border border-zinc-700 text-zinc-500 hover:border-green-800 hover:text-green-400
                       transition-colors"
          >
            <CheckCircle className="w-3 h-3" /> Mark done
          </button>
        )}
      </div>
    </div>
  );
}

// ── Add Reminder Form ─────────────────────────────────────────────────────────

function AddReminderAccordion() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    project:   "",
    milestone: "",
    dueDate:   "",
    channels:  { "email": true, "in-app": true, "sms": false } as Record<NotifChannel, boolean>,
  });

  function handleSave() {
    if (!form.project || !form.milestone || !form.dueDate) return;
    setSaved(true);
    setTimeout(() => { setSaved(false); setOpen(false); }, 1800);
  }

  return (
    <div className="border border-zinc-800 rounded-sm overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => e.key === "Enter" && setOpen((v) => !v)}
        className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-zinc-900 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Plus className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-mono text-xs text-zinc-300">Add Reminder</span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-zinc-600 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>

      {open && (
        <div className="border-t border-zinc-800 p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">Project</label>
              <input
                className="w-full bg-zinc-900 border border-zinc-700 rounded-sm px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-amber-700 placeholder-zinc-700"
                placeholder="e.g. CRM Connector v3"
                value={form.project}
                onChange={(e) => setForm((f) => ({ ...f, project: e.target.value }))}
              />
            </div>
            <div>
              <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">Milestone</label>
              <input
                className="w-full bg-zinc-900 border border-zinc-700 rounded-sm px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-amber-700 placeholder-zinc-700"
                placeholder="e.g. API Review"
                value={form.milestone}
                onChange={(e) => setForm((f) => ({ ...f, milestone: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">Due Date</label>
            <input
              type="date"
              className="bg-zinc-900 border border-zinc-700 rounded-sm px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-amber-700"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </div>

          <div>
            <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">Notify via</label>
            <div className="flex gap-2 flex-wrap">
              {(["in-app", "email", "sms"] as NotifChannel[]).map((ch) => (
                <button
                  key={ch}
                  onClick={() => setForm((f) => ({
                    ...f, channels: { ...f.channels, [ch]: !f.channels[ch] }
                  }))}
                  className={`font-mono text-[10px] px-2 py-1 rounded-sm border transition-colors ${
                    form.channels[ch]
                      ? "border-amber-800 text-amber-400 bg-amber-950/30"
                      : "border-zinc-700 text-zinc-500"
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saved}
              className="flex-1 h-8 rounded-sm bg-amber-950 border border-amber-800 text-amber-400 font-mono text-xs hover:bg-amber-900 transition-colors disabled:opacity-60"
            >
              {saved ? "✓ Saved" : "Save Reminder"}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="h-8 px-3 rounded-sm border border-zinc-700 text-zinc-500 font-mono text-xs hover:border-zinc-500 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({
  label,
  icon,
  children,
  count,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        {icon}
        <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{label}</span>
        {count !== undefined && (
          <span className="font-mono text-[10px] text-zinc-700">({count})</span>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RemindersPage() {
  const [milestones, setMilestones] = useState<Milestone[]>(DEMO_MILESTONES);

  function markDone(id: string) {
    setMilestones((prev) =>
      prev.map((m) => m.id === id ? { ...m, done: true, status: "done", completionPct: 100 } : m)
    );
  }

  const overdue = milestones.filter((m) => m.status === "overdue" && !m.done);
  const today   = milestones.filter((m) => m.status === "today"   && !m.done);
  const soon    = milestones.filter((m) => m.status === "soon"    && !m.done);
  const later   = milestones.filter((m) => m.status === "later"   && !m.done);
  const done    = milestones.filter((m) => m.done);

  const slaBreaches = milestones.filter((m) => m.slaBreached && !m.done);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      {/* Sidebar */}
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
            { label: "Alerts",    href: "/notifications",        active: false },
            { label: "Reminders", href: "/reminders",            active: true  },
            { label: "Settings",  href: "/notification-settings",active: false },
          ].map(({ label, href, active }) => (
            <a key={label} href={href}
              className={`block px-3 py-1.5 rounded-sm font-mono text-xs transition-colors ${
                active
                  ? "text-zinc-100 bg-zinc-800"
                  : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >{label}</a>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-4 pb-20 lg:pb-4 space-y-5 max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-amber-400" />
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
              Reminders
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-zinc-500">
              {milestones.filter((m) => !m.done).length} active
            </span>
          </div>
        </div>

        {/* SLA Breach Banner */}
        {slaBreaches.length > 0 && (
          <div className="border border-red-900 bg-red-950/40 rounded-sm px-3 py-2.5 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-mono text-xs text-red-300 font-medium">
                {slaBreaches.length} SLA breach{slaBreaches.length > 1 ? "es" : ""} detected
              </p>
              <p className="font-mono text-[10px] text-red-500 mt-0.5">
                {slaBreaches.map((m) => m.project).join(", ")} — escalation may be required
              </p>
            </div>
          </div>
        )}

        {/* Add Reminder */}
        <AddReminderAccordion />

        {/* Overdue */}
        {overdue.length > 0 && (
          <Section
            label="Overdue"
            icon={<Flame className="w-3.5 h-3.5 text-red-400" />}
            count={overdue.length}
          >
            {overdue.map((m) => <MilestoneRow key={m.id} milestone={m} onComplete={markDone} />)}
          </Section>
        )}

        {/* Today */}
        {today.length > 0 && (
          <Section
            label="Due Today"
            icon={<Bell className="w-3.5 h-3.5 text-amber-400" />}
            count={today.length}
          >
            {today.map((m) => <MilestoneRow key={m.id} milestone={m} onComplete={markDone} />)}
          </Section>
        )}

        {/* This Week */}
        {soon.length > 0 && (
          <Section
            label="This Week"
            icon={<Clock className="w-3.5 h-3.5 text-amber-500" />}
            count={soon.length}
          >
            {soon.map((m) => <MilestoneRow key={m.id} milestone={m} onComplete={markDone} />)}
          </Section>
        )}

        {/* Later */}
        {later.length > 0 && (
          <Section
            label="Later"
            icon={<Calendar className="w-3.5 h-3.5 text-zinc-500" />}
            count={later.length}
          >
            {later.map((m) => <MilestoneRow key={m.id} milestone={m} onComplete={markDone} />)}
          </Section>
        )}

        {/* Done */}
        {done.length > 0 && (
          <Section
            label="Completed"
            icon={<CheckCircle className="w-3.5 h-3.5 text-green-600" />}
            count={done.length}
          >
            {done.map((m) => <MilestoneRow key={m.id} milestone={m} onComplete={markDone} />)}
          </Section>
        )}
      </main>
    </div>
  );
}
