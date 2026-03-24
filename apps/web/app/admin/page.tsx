import Link from "next/link";
import { fetchRevenueSummary, fetchAdminListings, fetchAdminDeployments } from "@/lib/adminApi";

const ADMIN_SECTIONS = [
  { label: "Payouts",         href: "/admin/payouts"         },
  { label: "Warranty Claims", href: "/admin/warranty-claims" },
  { label: "Audit Log",       href: "/admin/audit"           },
  { label: "Feature Flags",   href: "/admin/feature-flags"   },
  { label: "Contracts",       href: "/admin/contracts"       },
  { label: "Announcements",   href: "/admin/announcements"   },
  { label: "Listings",        href: "/admin/listings"        },
  { label: "Deployments",     href: "/admin/deployments"     },
  { label: "Revenue",         href: "/admin/revenue"         },
  { label: "Users",           href: "/admin/users"           },
];

function fmtUSD(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-5">
      <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">{label}</p>
      <p className="text-2xl font-mono text-zinc-50">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
    </div>
  );
}

export default async function AdminOverview() {
  const [revenue, listings, deployments] = await Promise.allSettled([
    fetchRevenueSummary(),
    fetchAdminListings(),
    fetchAdminDeployments(),
  ]);

  const rev     = revenue.status     === "fulfilled" ? revenue.value     : null;
  const pending = listings.status    === "fulfilled"
    ? listings.value.listings.filter((l) => l.listing_status === "PENDING_REVIEW").length
    : 0;
  const vetoWindow = deployments.status === "fulfilled"
    ? deployments.value.deployments.filter((d) => d.state === "VETO_WINDOW").length
    : 0;

  return (
    <div>
      <h1 className="text-base font-semibold text-zinc-50 mb-6">Platform Overview</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-6">
        {ADMIN_SECTIONS.map(s => (
          <Link key={s.href} href={s.href}
            className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-sm p-3 text-xs text-zinc-300 hover:text-zinc-50 transition-colors">
            {s.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Escrow (All Time)"
          value={rev ? fmtUSD(rev.total_escrow_cents) : "—"}
          sub="All deployments"
        />
        <StatCard
          label="Released via Payouts"
          value={rev ? fmtUSD(rev.released_cents) : "—"}
          sub={`${rev?.payout_count ?? 0} payouts`}
        />
        <StatCard
          label="Pending Listings"
          value={String(pending)}
          sub="Awaiting moderation"
        />
        <StatCard
          label="In Veto Window"
          value={String(vetoWindow)}
          sub="Active now"
        />
      </div>

      {/* Deployment state breakdown */}
      {rev && rev.by_state.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-5">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-4">
            Deployment States
          </p>
          <div className="space-y-2">
            {rev.by_state.map((s) => (
              <div key={s.state} className="flex items-center justify-between text-sm">
                <span className="font-mono text-zinc-400">{s.state}</span>
                <div className="flex gap-6 text-right">
                  <span className="text-zinc-500 text-xs">{fmtUSD(s.escrow_cents)}</span>
                  <span className="text-zinc-50 w-8">{s.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
