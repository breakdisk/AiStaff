"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Inbox, Briefcase, Mail } from "lucide-react";

// ── Nav definitions ─────────────────────────────────────────────────────────

const PRIMARY_NAV = [
  { label: "Dashboard",   href: "/dashboard"   },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Matching",    href: "/matching"    },
  { label: "Profile",     href: "/profile"     },
];

const SECTION_NAV: { heading: string; items: { label: string; href: string }[] }[] = [
  {
    heading: "AI Tools",
    items: [
      { label: "Scoping",      href: "/scoping"      },
      { label: "Outcomes",     href: "/outcomes"     },
      { label: "Proposals",    href: "/proposals"    },
      { label: "Pricing Tool", href: "/pricing-tool" },
    ],
  },
  {
    heading: "Payments",
    items: [
      { label: "Escrow",             href: "/escrow"             },
      { label: "Payouts",            href: "/payouts"            },
      { label: "Billing",            href: "/billing"            },
      { label: "Smart Contracts",    href: "/smart-contracts"    },
      { label: "Outcome Listings",   href: "/outcome-listings"   },
      { label: "Pricing Calculator", href: "/pricing-calculator" },
    ],
  },
  {
    heading: "Workspace",
    items: [
      { label: "Work Diaries",  href: "/work-diaries"  },
      { label: "Async Collab",  href: "/async-collab"  },
      { label: "Collaboration", href: "/collab"         },
      { label: "Success Layer", href: "/success-layer"  },
      { label: "Quality Gate",  href: "/quality-gate"   },
    ],
  },
  {
    heading: "Legal",
    items: [
      { label: "Legal Toolkit", href: "/legal-toolkit"     },
      { label: "Tax Engine",    href: "/tax-engine"        },
      { label: "Reputation",    href: "/reputation-export" },
      { label: "Transparency",  href: "/transparency"      },
    ],
  },
  {
    heading: "Notifications",
    items: [
      { label: "Alerts",    href: "/notifications"         },
      { label: "Reminders", href: "/reminders"             },
      { label: "Settings",  href: "/notification-settings" },
    ],
  },
  {
    heading: "Enterprise",
    items: [
      { label: "Industry Suites", href: "/vertical"                },
      { label: "Enterprise Hub",  href: "/enterprise"              },
      { label: "Talent Pools",    href: "/enterprise/talent-pools" },
      { label: "SLA Dashboard",   href: "/enterprise/sla"          },
      { label: "Global & Access", href: "/global"                  },
    ],
  },
  {
    heading: "Trust",
    items: [
      { label: "Proof of Human", href: "/proof-of-human" },
    ],
  },
];

export const MOBILE_NAV = [
  { label: "Dash",    href: "/dashboard"   },
  { label: "Market",  href: "/marketplace" },
  { label: "Matching", href: "/matching"   },
  { label: "Profile", href: "/profile"     },
];

// ── Sidebar ─────────────────────────────────────────────────────────────────

interface AppSidebarProps {
  /** Optional LIVE/DEMO/loading badge in the sidebar header */
  status?: "live" | "demo" | "loading";
}

export function AppSidebar({ status }: AppSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role        = (session?.user as { role?: string | null })?.role ?? null;
  const accountType = (session?.user as { accountType?: string })?.accountType ?? "";
  const showEnterprise = role === "agent-owner" || role === "client" || accountType === "agency";
  const showInbox        = role !== "talent";
  const showInvitations  = !!session?.user;

  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!session?.user) return;
    const poll = () =>
      fetch("/api/collab/unread")
        .then(r => r.ok ? r.json() : { unread: 0 })
        .then((d: { unread?: number }) => setUnread(d.unread ?? 0))
        .catch(() => {});
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, [session]);

  return (
    <aside className="hidden lg:flex lg:flex-col w-56 border-r border-zinc-800 bg-zinc-950 p-4 gap-6 lg:h-screen lg:sticky lg:top-0 overflow-y-auto">
      {/* Brand + status badge */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-zinc-500 uppercase tracking-widest">AiStaffApp</span>
        {status && (
          <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded-sm border ${
            status === "live"
              ? "border-green-800 text-green-400"
              : status === "demo"
              ? "border-zinc-700 text-zinc-500"
              : "border-zinc-800 text-zinc-700"
          }`}>
            {status === "live" ? "LIVE" : status === "demo" ? "DEMO" : "…"}
          </span>
        )}
      </div>

      {/* Primary nav */}
      <nav className="flex flex-col gap-1">
        {PRIMARY_NAV.map(({ label, href }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
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
          );
        })}
      </nav>

      {/* Engagement nav */}
      <div className="space-y-1">
        <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">Engagements</p>
        {showInbox && (
          <a
            href="/proposals/inbox"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-sm font-mono text-xs transition-colors ${
              pathname === "/proposals/inbox"
                ? "text-zinc-100 bg-zinc-800"
                : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900"
            }`}
          >
            <Inbox size={12} />
            Proposals Inbox
          </a>
        )}
        {showInvitations && (
          <a
            href="/invitations"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-sm font-mono text-xs transition-colors ${
              pathname === "/invitations"
                ? "text-zinc-100 bg-zinc-800"
                : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900"
            }`}
          >
            <Mail size={12} />
            Invitations
          </a>
        )}
        <a
          href="/engagements"
          className={`flex items-center gap-2 px-3 py-1.5 rounded-sm font-mono text-xs transition-colors ${
            pathname === "/engagements" || pathname.startsWith("/engagements/")
              ? "text-zinc-100 bg-zinc-800"
              : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900"
          }`}
        >
          <Briefcase size={12} />
          Engagements
        </a>
      </div>

      {/* Section groups */}
      {SECTION_NAV.map(({ heading, items }) => {
        if (heading === "Enterprise" && !showEnterprise) return null;
        return (
          <div key={heading} className="space-y-1">
            <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">
              {heading}
            </p>
            {items.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                className="flex items-center justify-between px-3 py-1.5 rounded-sm font-mono text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
              >
                {label}
                {label === "Collaboration" && unread > 0 && (
                  <span className="ml-1.5 min-w-[16px] h-4 px-1 rounded-sm bg-amber-400 text-zinc-950 font-mono text-[9px] font-bold flex items-center justify-center">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </a>
            ))}
          </div>
        );
      })}
    </aside>
  );
}

// ── Mobile bottom nav ────────────────────────────────────────────────────────

export function AppMobileNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string | null })?.role ?? null;
  const showInvitations = !!session?.user;

  const mobileItems = [
    ...MOBILE_NAV,
    ...(showInvitations ? [{ label: "Inbox", href: "/invitations" }] : []),
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-16 flex items-center border-t border-zinc-800 bg-zinc-950">
      {mobileItems.map(({ label, href }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <a
            key={label}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-full font-mono text-[10px] uppercase tracking-widest transition-colors ${
              active ? "text-amber-400" : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}
