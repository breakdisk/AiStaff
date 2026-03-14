"use client";

import { usePathname } from "next/navigation";

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

  return (
    <aside className="hidden lg:flex lg:flex-col w-56 border-r border-zinc-800 bg-zinc-950 p-4 gap-6 overflow-y-auto">
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

      {/* Section groups */}
      {SECTION_NAV.map(({ heading, items }) => (
        <div key={heading} className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-700 uppercase tracking-widest px-3">
            {heading}
          </p>
          {items.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="block px-3 py-1.5 rounded-sm font-mono text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
            >
              {label}
            </a>
          ))}
        </div>
      ))}
    </aside>
  );
}

// ── Mobile bottom nav ────────────────────────────────────────────────────────

export function AppMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-16 flex items-center border-t border-zinc-800 bg-zinc-950">
      {MOBILE_NAV.map(({ label, href }) => {
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
