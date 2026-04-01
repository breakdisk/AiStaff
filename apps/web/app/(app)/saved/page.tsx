"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, Trash2, ExternalLink } from "lucide-react";

interface SavedListing {
  listing_id: string;
  name: string;
  description: string;
  price_cents: number;
  category: string;
  slug: string;
  saved_at: string;
}

function CategoryBadge({ category }: { category: string }) {
  const cls =
    category === "AiTalent" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
    category === "AiRobot"  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                              "bg-amber-400/10 text-amber-400 border-amber-400/20";
  return (
    <span className={`inline-block rounded-sm border px-1.5 py-0.5 font-mono text-[10px] ${cls}`}>
      {category}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-sm border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div className="h-4 w-2/3 rounded bg-zinc-800" />
      <div className="h-3 w-full rounded bg-zinc-800" />
      <div className="h-3 w-3/4 rounded bg-zinc-800" />
      <div className="h-8 w-24 rounded bg-zinc-800" />
    </div>
  );
}

export default function SavedPage() {
  const [items, setItems] = useState<SavedListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/saved")
      .then((r) => r.json() as Promise<SavedListing[]>)
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  const unsave = async (listingId: string) => {
    setItems((prev) => prev.filter((i) => i.listing_id !== listingId));
    await fetch(`/api/saved/${listingId}`, { method: "DELETE" });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Bookmark className="w-5 h-5 text-amber-400" />
          <h1 className="text-lg font-mono font-semibold text-zinc-50">Saved Listings</h1>
          {!loading && (
            <span className="font-mono text-xs text-zinc-500">({items.length})</span>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-sm border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="font-mono text-sm text-zinc-400 mb-4">
              No saved listings yet. Browse the marketplace to save agents.
            </p>
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-400 text-zinc-950 font-mono text-sm font-semibold rounded-sm hover:bg-amber-300 transition-colors"
            >
              Browse Marketplace
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <div
                key={item.listing_id}
                className="rounded-sm border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <CategoryBadge category={item.category} />
                  <button
                    onClick={() => unsave(item.listing_id)}
                    className="text-zinc-600 hover:text-red-500 transition-colors"
                    aria-label="Remove from saved"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <Link
                    href={`/marketplace/${item.slug}`}
                    className="font-mono text-sm font-semibold text-zinc-50 hover:text-amber-400 transition-colors line-clamp-1"
                  >
                    {item.name}
                  </Link>
                  <p className="font-mono text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="flex items-center justify-between mt-auto pt-2 border-t border-zinc-800">
                  <span className="font-mono text-sm text-amber-400">
                    {item.price_cents
                      ? `$${(item.price_cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                      : "Custom"}
                  </span>
                  <Link
                    href={`/marketplace/${item.slug}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-50 font-mono text-xs rounded-sm transition-colors"
                  >
                    View
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
