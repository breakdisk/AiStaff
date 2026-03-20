import type { MetadataRoute } from "next";

const BASE = "https://aistaffglobal.com";

// Static public pages — always included
// Only include pages that are genuinely crawlable without authentication.
// Authenticated pages (/marketplace, /leaderboard, /scoping, etc.) redirect
// crawlers to /login — listing them here wastes crawl budget and signals
// thin content to search engines and LLM indexers.
const STATIC_ROUTES: { url: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { url: "/",               priority: 1.0,  changeFrequency: "daily"   },
  { url: "/pricing-tool",   priority: 0.75, changeFrequency: "weekly"  },
  { url: "/transparency",   priority: 0.7,  changeFrequency: "monthly" },
  { url: "/proof-of-human", priority: 0.7,  changeFrequency: "monthly" },
];

async function fetchListingIds(): Promise<string[]> {
  try {
    const url = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";
    const res = await fetch(`${url}/listings`, {
      next: { revalidate: 3600 }, // ISR: revalidate every hour
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json() as { id: string }[];
    return data.map((l) => l.id);
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map(({ url, priority, changeFrequency }) => ({
    url:             `${BASE}${url}`,
    lastModified:    now,
    changeFrequency,
    priority,
  }));

  const listingIds = await fetchListingIds();
  const listingEntries: MetadataRoute.Sitemap = listingIds.map((id) => ({
    url:             `${BASE}/listings/${id}`,
    lastModified:    now,
    changeFrequency: "daily",
    priority:        0.85,
  }));

  return [...staticEntries, ...listingEntries];
}
