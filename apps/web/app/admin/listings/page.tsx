import { fetchAdminListings, type AdminListing } from "@/lib/adminApi";
import { ListingActions } from "./ListingActions";

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
  searchParams: Promise<{ status?: string }>;
}) {
  const sp   = await searchParams;
  const data = await fetchAdminListings(sp.status)
    .catch(() => ({ listings: [] as AdminListing[] }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-base font-semibold text-zinc-50">
          Listings ({data.listings.length})
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
              href={v ? `?status=${v}` : "?"}
              className="px-2 py-1 bg-zinc-800 border border-zinc-700 text-zinc-300
                         hover:text-zinc-50 transition-colors"
            >
              {label}
            </a>
          ))}
        </div>
      </div>

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
    </div>
  );
}
