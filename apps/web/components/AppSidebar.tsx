"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Inbox, Briefcase, Mail, Bell, LogOut, X } from "lucide-react";
import { signOut } from "next-auth/react";

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
      { label: "Earnings",           href: "/earnings"           },
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
      { label: "Industry Suites", href: "/vertical"                  },
      { label: "Enterprise Hub",  href: "/enterprise"                },
      { label: "Members",         href: "/enterprise/members"        },
      { label: "Proposals",       href: "/enterprise/proposals"      },
      { label: "Bundles",         href: "/enterprise/bundles"        },
      { label: "Talent Pools",    href: "/enterprise/talent-pools"   },
      { label: "SLA Dashboard",   href: "/enterprise/sla"            },
      { label: "Global & Access", href: "/global"                    },
    ],
  },
  {
    heading: "Trust",
    items: [
      { label: "Proof of Human", href: "/proof-of-human" },
    ],
  },
];

// Which section groups are shown per primary nav context
const CONTEXT_SECTIONS: Record<string, string[]> = {
  "/dashboard":   ["AI Tools", "Workspace", "Notifications", "Enterprise"],
  "/marketplace": ["Payments", "Legal", "Enterprise"],
  "/leaderboard": ["Trust", "Enterprise"],
  "/matching":    ["AI Tools", "Workspace"],
  "/profile":     ["Legal", "Trust", "Notifications"],
};

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
  const isAdmin     = (session?.user as { isAdmin?: boolean })?.isAdmin ?? false;
  const showEnterprise = isAdmin || role === "agent-owner" || role === "client" || accountType === "agency";
  const showInbox        = role !== "talent";
  const showInvitations  = !!session?.user;

  const [notifCount, setNotifCount] = useState(0);
  useEffect(() => {
    if (!session?.user) return;
    const poll = () =>
      fetch("/api/notifications/count")
        .then(r => r.ok ? r.json() : { count: 0 })
        .then((d: { count?: number }) => setNotifCount(d.count ?? 0))
        .catch(() => {});
    poll();
    const id = setInterval(poll, 30_000);
    // Refresh immediately when a notification is marked read on the page
    window.addEventListener("notif-count-changed", poll);
    return () => {
      clearInterval(id);
      window.removeEventListener("notif-count-changed", poll);
    };
  }, [session]);

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
        <div className="flex items-center gap-2">
          {session?.user && (
            <a href="/notifications" className="relative p-0.5" aria-label="Notifications">
              <Bell size={15} className={notifCount > 0 ? "text-amber-400" : "text-zinc-400"} />
              {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 rounded-sm bg-amber-400 text-zinc-950 font-mono text-[8px] font-bold flex items-center justify-center">
                  {notifCount > 99 ? "99+" : notifCount}
                </span>
              )}
            </a>
          )}
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

      {/* Section groups — filtered by active primary nav context */}
      {(() => {
        const activeRoot = PRIMARY_NAV.find(({ href }) =>
          pathname === href || pathname.startsWith(href + "/")
        )?.href ?? "/dashboard";
        const allowed = CONTEXT_SECTIONS[activeRoot] ?? CONTEXT_SECTIONS["/dashboard"];
        return SECTION_NAV.filter(({ heading }) => allowed.includes(heading));
      })().map(({ heading, items }) => {
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
      {/* Logout */}
      {session?.user && (
        <div className="mt-auto pt-3 border-t border-zinc-800">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-sm font-mono text-xs text-zinc-500 hover:text-red-400 hover:bg-zinc-900 transition-colors"
          >
            <LogOut size={12} />
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}

// ── Mobile bottom nav ────────────────────────────────────────────────────────

export function AppMobileNav() {
  const pathname  = usePathname();
  const { data: session } = useSession();
  const [moreOpen, setMoreOpen] = useState(false);

  const mobileItems = [
    ...MOBILE_NAV,
    ...(session?.user ? [{ label: "Inbox", href: "/invitations" }] : []),
  ];

  return (
    <>
      {/* ── Bottom tab bar ───────────────────────────────────────────────── */}
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

        {/* More — opens full section nav as bottom sheet */}
        <button
          onClick={() => setMoreOpen(true)}
          aria-label="More navigation"
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-full font-mono text-[10px] uppercase tracking-widest transition-colors ${
            moreOpen ? "text-amber-400" : "text-zinc-600 hover:text-zinc-400"
          }`}
        >
          More
        </button>
      </nav>

      {/* ── More bottom sheet ────────────────────────────────────────────── */}
      {moreOpen && (
        <>
          {/* Backdrop */}
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/60"
            onClick={() => setMoreOpen(false)}
          />

          {/* Sheet */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t border-zinc-800 max-h-[78vh] flex flex-col">
            {/* Handle + header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
              <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                Menu
              </span>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
                className="p-1 text-zinc-600 hover:text-zinc-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable nav sections */}
            <div className="overflow-y-auto pb-20 px-4 py-3 space-y-5">
              {SECTION_NAV.map((section) => (
                <div key={section.heading}>
                  <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-1.5">
                    {section.heading}
                  </p>
                  <div className="space-y-0.5">
                    {section.items.map(({ label, href }) => {
                      const active = pathname === href || pathname.startsWith(href + "/");
                      return (
                        <a
                          key={href}
                          href={href}
                          onClick={() => setMoreOpen(false)}
                          className={`block px-3 py-2 font-mono text-xs rounded-sm transition-colors ${
                            active
                              ? "text-amber-400 bg-amber-950/30"
                              : "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900"
                          }`}
                        >
                          {label}
                        </a>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
