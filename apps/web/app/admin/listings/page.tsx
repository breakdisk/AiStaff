import { fetchAdminListings, fetchAdminBundles, type AdminListing, type AdminBundle } from "@/lib/adminApi";
import { ListingActions } from "./ListingActions";
import { BundleActions } from "./BundleActions";

function fmtUSD(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const statusColor: Record<string, string> = {
  APPROVED:       "text-emerald-400",
  PENDING_REVIEW: "text-amber-400",
  REJECTED:       "text-red-400",
};

export default async function AdminListings({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab === "bundles" ? "bundles" : "listings";
  const statusFilter = sp.status;

  // Fetch bundles only when on bundles tab
  const { bundles } = tab === "bundles"
    ? await fetchAdminBundles(statusFilter).catch(() => ({ bundles: [] as AdminBundle[] }))
    : { bundles: [] as AdminBundle[] };

  const data = tab === "listings"
    ? await fetchAdminListings(statusFilter).catch(() => ({ listings: [] as AdminListing[] }))
    : { listings: [] as AdminListing[] };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-base font-semibold text-zinc-50">
          {tab === "listings" ? `Listings (${data.listings.length})` : `Bundles (${bundles.length})`}
        </h1>
        <div className="flex gap-2 text-xs flex-wrap">
          {(
            [
              ["", "All"],
              ["PENDING_REVIEW", "Pending"],
              ["APPROVED", "Approved"],
              ["REJECTED", "Rejected"],
            ] as const
          ).map(([v, label]) => (
            <a
              key={v}
              href={v ? `?tab=${tab}&status=${v}` : `?tab=${tab}`}
              className="px-2 py-1 bg-zinc-800 border border-zinc-700 text-zinc-300
                         hover:text-zinc-50 transition-colors"
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-4">
        {(["listings", "bundles"] as const).map((t) => (
          <a key={t} href={`?tab=${t}`}
            className={`px-3 py-1.5 font-mono text-xs border transition-colors ${
              tab === t
                ? "border-amber-500 text-amber-400 bg-amber-950/20"
                : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
            }`}>
            {t === "listings" ? "Agent Listings" : "Bundles"}
          </a>
        ))}
      </div>

      {tab === "listings" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase tracking-wider">
                <th className="text-left px-4 py-2">Listing</th>
                <th className="text-left px-4 py-2">Category</th>
                <th className="text-left px-4 py-2">Price</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.listings.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="text-zinc-50 font-medium">{l.name}</p>
                    <p className="text-zinc-500 text-xs line-clamp-1">{l.description}</p>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{l.category}</td>
                  <td className="px-4 py-3 text-zinc-300 font-mono">{fmtUSD(l.price_cents)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-mono ${statusColor[l.listing_status] ?? "text-zinc-400"}`}
                    >
                      {l.listing_status}
                    </span>
                    {l.rejection_reason && (
                      <p className="text-xs text-zinc-600 mt-0.5">{l.rejection_reason}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ListingActions listing={l} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.listings.length === 0 && (
            <p className="text-center text-zinc-500 text-sm py-8">No listings found.</p>
          )}
        </div>
      )}

      {tab === "bundles" && (
        <div className="border border-zinc-800 rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase tracking-wider">
                <th className="text-left px-4 py-2">Name</th>
                <th className="text-left px-4 py-2">Org</th>
                <th className="text-left px-4 py-2">Items</th>
                <th className="text-left px-4 py-2">Price</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bundles.map((bundle) => (
                <tr key={bundle.id} className="border-b border-zinc-800 last:border-0">
                  <td className="px-4 py-3 text-zinc-50 font-medium">{bundle.name}</td>
                  <td className="px-4 py-3 text-zinc-500 font-mono text-xs truncate max-w-[120px]">{bundle.org_id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{bundle.item_count}</td>
                  <td className="px-4 py-3 text-amber-400 font-mono text-xs">${(bundle.price_cents / 100).toFixed(2)}/mo</td>
                  <td className="px-4 py-3">
                    <span className={`font-mono text-xs ${
                      bundle.listing_status === "APPROVED" ? "text-emerald-400" :
                      bundle.listing_status === "REJECTED" ? "text-red-400" : "text-amber-400"
                    }`}>● {bundle.listing_status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <BundleActions bundle={bundle} />
                  </td>
                </tr>
              ))}
              {bundles.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-500">
                  No bundles found.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
