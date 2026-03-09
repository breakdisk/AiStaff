"use client";

import { useState } from "react";
import {
  Bell, BellOff, Check, CheckCheck, ChevronDown, ChevronRight,
  Zap, Clock, AlertTriangle, Info, Users, ExternalLink,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type NotifKind = "proposal" | "reminder" | "system" | "alert";
type FilterTab  = "all" | "proposals" | "reminders" | "system";

interface TalentSummary {
  id:         string;
  name:       string;
  matchScore: number;
  trustScore: number;
  skills:     string[];
  hourlyRate: number;
}

interface Notification {
  id:        string;
  kind:      NotifKind;
  title:     string;
  body:      string;
  timestamp: string;
  read:      boolean;
  // proposal-specific
  proposals?: TalentSummary[];
  // alert-specific
  severity?: "critical" | "warning" | "info";
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_NOTIFICATIONS: Notification[] = [
  {
    id: "n-001",
    kind: "proposal",
    title: "3 top-matched freelancers found for DataSync Agent",
    body: "AI ranked 12 candidates — top 3 match ≥87% on required skills.",
    timestamp: "2 min ago",
    read: false,
    proposals: [
      { id: "t-01", name: "Alexei V.", matchScore: 0.92, trustScore: 88, skills: ["rust", "wasm", "kafka"], hourlyRate: 185 },
      { id: "t-02", name: "Priya M.",  matchScore: 0.87, trustScore: 74, skills: ["rust", "kafka"],         hourlyRate: 155 },
      { id: "t-03", name: "Omar K.",   matchScore: 0.81, trustScore: 61, skills: ["wasm", "python"],        hourlyRate: 120 },
    ],
  },
  {
    id: "n-002",
    kind: "reminder",
    title: "Milestone due in 18 hours — 'API Integration Review'",
    body: "Project: CRM Connector v3 · Deployment dep-01J9X2Z3 · SLA deadline approaching.",
    timestamp: "14 min ago",
    read: false,
  },
  {
    id: "n-003",
    kind: "alert",
    title: "Drift detected — artifact hash mismatch",
    body: "Deployment dep-02A3B4C5 · Expected sha256:a1b2… · Got sha256:ff99…",
    timestamp: "1 hr ago",
    read: false,
    severity: "critical",
  },
  {
    id: "n-004",
    kind: "proposal",
    title: "2 new candidates for ML Pipeline Agent",
    body: "AI ranked 7 candidates — top 2 match ≥75% on required skills.",
    timestamp: "3 hr ago",
    read: true,
    proposals: [
      { id: "t-04", name: "Sara L.",   matchScore: 0.79, trustScore: 67, skills: ["python", "kafka"],  hourlyRate: 140 },
      { id: "t-05", name: "James T.",  matchScore: 0.75, trustScore: 58, skills: ["python", "mlflow"], hourlyRate: 115 },
    ],
  },
  {
    id: "n-005",
    kind: "system",
    title: "License lic-f47a… expires in 12 days",
    body: "DataSync Agent · Jurisdiction: US · 5 seats · Renew before 2026-03-20.",
    timestamp: "5 hr ago",
    read: true,
    severity: "warning",
  },
  {
    id: "n-006",
    kind: "system",
    title: "Environment pre-flight passed for dep-03C5D6E7",
    body: "All 6 DoD checks completed successfully. Wasm hash verified.",
    timestamp: "Yesterday",
    read: true,
    severity: "info",
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function KindBadge({ kind, severity }: { kind: NotifKind; severity?: string }) {
  if (kind === "proposal") {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded-sm border border-amber-900 text-amber-400">
        <Users className="w-2.5 h-2.5" /> PROPOSAL
      </span>
    );
  }
  if (kind === "reminder") {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded-sm border border-blue-900 text-blue-400">
        <Clock className="w-2.5 h-2.5" /> REMINDER
      </span>
    );
  }
  if (kind === "alert") {
    const col = severity === "critical" ? "border-red-900 text-red-400" : "border-amber-900 text-amber-400";
    return (
      <span className={`inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded-sm border ${col}`}>
        <AlertTriangle className="w-2.5 h-2.5" />
        {severity === "critical" ? "CRITICAL" : "WARNING"}
      </span>
    );
  }
  const col = severity === "info" ? "border-zinc-700 text-zinc-400" : "border-amber-900 text-amber-400";
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded-sm border ${col}`}>
      <Info className="w-2.5 h-2.5" /> SYSTEM
    </span>
  );
}

function MatchScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 85 ? "bg-green-500" : pct >= 70 ? "bg-amber-500" : "bg-zinc-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-zinc-400 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

function TalentRow({ t }: { t: TalentSummary }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-sm bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
          <span className="font-mono text-xs text-zinc-300">{t.name[0]}</span>
        </div>
        <div className="min-w-0">
          <p className="font-mono text-xs text-zinc-200 truncate">{t.name}</p>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {t.skills.map((s) => (
              <span key={s} className="font-mono text-[9px] text-zinc-500 bg-zinc-800 px-1 rounded-sm">{s}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2 w-24">
        <MatchScoreBar score={t.matchScore} />
        <span className="font-mono text-[10px] text-zinc-500">${t.hourlyRate}/hr · T{t.trustScore >= 70 ? 2 : t.trustScore >= 40 ? 1 : 0}</span>
      </div>
    </div>
  );
}

function NotificationRow({
  notif,
  onMarkRead,
}: {
  notif: Notification;
  onMarkRead: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`border-b border-zinc-800 transition-colors ${notif.read ? "" : "bg-zinc-900/60"}`}>
      {/* Header row */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => e.key === "Enter" && setExpanded((v) => !v)}
        className="flex items-start gap-3 px-4 py-3 hover:bg-zinc-900/80 cursor-pointer"
      >
        {/* Unread dot */}
        <div className="flex-shrink-0 mt-1.5">
          {notif.read ? (
            <div className="w-2 h-2 rounded-full bg-transparent" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-amber-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <KindBadge kind={notif.kind} severity={notif.severity} />
            <span className="font-mono text-[10px] text-zinc-600">{notif.timestamp}</span>
          </div>
          <p className="font-mono text-xs text-zinc-200 leading-snug">{notif.title}</p>
          <p className="font-mono text-[10px] text-zinc-500 mt-0.5 leading-snug line-clamp-1">{notif.body}</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {!notif.read && (
            <button
              onClick={(e) => { e.stopPropagation(); onMarkRead(notif.id); }}
              className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
              title="Mark as read"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-3 pl-9 space-y-3">
          {/* Full body */}
          <p className="font-mono text-xs text-zinc-400">{notif.body}</p>

          {/* Proposal details */}
          {notif.proposals && notif.proposals.length > 0 && (
            <div className="border border-zinc-800 rounded-sm">
              <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
                <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">AI-Ranked Matches</p>
                <span className="font-mono text-[10px] text-amber-400">{notif.proposals.length} candidates</span>
              </div>
              <div className="px-3">
                {notif.proposals.map((t) => <TalentRow key={t.id} t={t} />)}
              </div>
              <div className="px-3 py-2 border-t border-zinc-800">
                <a
                  href="/matching"
                  className="flex items-center gap-1.5 font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  View all candidates in Matching
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {/* Alert body extras */}
          {notif.kind === "alert" && notif.severity === "critical" && (
            <div className="border border-red-900 bg-red-950/40 rounded-sm px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="font-mono text-xs text-red-300">
                Deployment moved to <span className="font-medium">VETO_WINDOW</span> — warranty hold active.
                <a href="/transparency" className="ml-1.5 underline">View audit trail →</a>
              </p>
            </div>
          )}

          {/* Reminder CTA */}
          {notif.kind === "reminder" && (
            <a
              href="/reminders"
              className="inline-flex items-center gap-1.5 font-mono text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View all reminders <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>(DEMO_NOTIFICATIONS);
  const [filter, setFilter] = useState<FilterTab>("all");

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filtered = notifications.filter((n) => {
    if (filter === "all")       return true;
    if (filter === "proposals") return n.kind === "proposal";
    if (filter === "reminders") return n.kind === "reminder";
    if (filter === "system")    return n.kind === "system" || n.kind === "alert";
    return true;
  });

  function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  const FILTERS: { key: FilterTab; label: string; count?: number }[] = [
    { key: "all",       label: "All",       count: notifications.length },
    { key: "proposals", label: "Proposals", count: notifications.filter((n) => n.kind === "proposal").length },
    { key: "reminders", label: "Reminders", count: notifications.filter((n) => n.kind === "reminder").length },
    { key: "system",    label: "System",    count: notifications.filter((n) => n.kind === "system" || n.kind === "alert").length },
  ];

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
          <p className="font-mono text-[10px] text-zinc-700 uppercase tracking-widest px-3">AI Tools</p>
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
          <p className="font-mono text-[10px] text-zinc-700 uppercase tracking-widest px-3">Payments</p>
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
          <p className="font-mono text-[10px] text-zinc-700 uppercase tracking-widest px-3">Workspace</p>
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
          <p className="font-mono text-[10px] text-zinc-700 uppercase tracking-widest px-3">Legal</p>
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
          <p className="font-mono text-[10px] text-zinc-700 uppercase tracking-widest px-3">Notifications</p>
          {[
            { label: "Alerts",    href: "/notifications",        active: true  },
            { label: "Reminders", href: "/reminders",            active: false },
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
      <main className="flex-1 pb-20 lg:pb-0 max-w-2xl mx-auto w-full">
        {/* Page header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <Bell className="w-4 h-4 text-amber-400" />
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
              Notifications
            </h1>
            {unreadCount > 0 && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-sm border border-amber-900 bg-amber-950 text-amber-400">
                {unreadCount} unread
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 font-mono text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-0 border-b border-zinc-800 px-4">
          {FILTERS.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`font-mono text-xs px-3 py-2.5 border-b-2 transition-colors ${
                filter === key
                  ? "border-amber-400 text-amber-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label}
              {typeof count === "number" && (
                <span className="ml-1.5 text-[10px] text-zinc-600">({count})</span>
              )}
            </button>
          ))}
        </div>

        {/* Notification list */}
        <div>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <BellOff className="w-8 h-8 text-zinc-700" />
              <p className="font-mono text-xs text-zinc-600">No notifications in this category</p>
              <a href="/notification-settings" className="font-mono text-xs text-amber-500 hover:text-amber-400 transition-colors">
                Configure notification preferences →
              </a>
            </div>
          ) : (
            filtered.map((n) => (
              <NotificationRow key={n.id} notif={n} onMarkRead={markRead} />
            ))
          )}
        </div>

        {/* Bottom CTA */}
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-between">
            <p className="font-mono text-[10px] text-zinc-600">
              Showing {filtered.length} of {notifications.length} notifications
            </p>
            <a
              href="/notification-settings"
              className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Zap className="w-3 h-3" />
              Manage preferences
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
