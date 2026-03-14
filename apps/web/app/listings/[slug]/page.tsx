import { type Metadata } from "next";
import { redirect }      from "next/navigation";

// ── Types ────────────────────────────────────────────────────────────────────

interface ListingData {
  id:           string;
  name:         string;
  description:  string;
  price_cents:  number;
  category:     string;
  seller_type:  string;
  wasm_hash:    string;
  active:       boolean;
  slug:         string;
}

// ── Data fetcher ─────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchListing(slugOrId: string): Promise<ListingData | null> {
  const marketplaceUrl =
    process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

  // Route to the correct endpoint: UUID → /listings/:id, slug → /listings/by-slug/:slug
  const endpoint = UUID_RE.test(slugOrId)
    ? `${marketplaceUrl}/listings/${slugOrId}`
    : `${marketplaceUrl}/listings/by-slug/${slugOrId}`;

  try {
    const res = await fetch(endpoint, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return (await res.json()) as ListingData;
  } catch {
    return null;
  }
}

// ── Open Graph metadata ───────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const listing  = await fetchListing(slug);

  if (!listing) {
    return {
      title: "Listing not found — AiStaff",
      description: "This agent listing could not be found.",
    };
  }

  const fmtUSD = (cents: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency", currency: "USD", maximumFractionDigits: 0,
    }).format(cents / 100);

  const title       = `${listing.name} — AiStaff`;
  const description =
    `${listing.description.slice(0, 150)}… · ` +
    `${fmtUSD(listing.price_cents)} escrow · ${listing.category} · ${listing.seller_type}`;

  // Canonical URL always uses the slug for clean, shareable links.
  const canonicalSlug = listing.slug || listing.id;
  const canonicalUrl  = `https://aistaffglobal.com/listings/${canonicalSlug}`;

  return {
    title,
    description,
    openGraph: {
      type:        "website",
      url:         canonicalUrl,
      title,
      description,
      siteName:    "AiStaff",
      images: [
        {
          url:    `https://aistaffglobal.com/og-default.png`,
          width:  1200,
          height: 630,
          alt:    listing.name,
        },
      ],
    },
    twitter: {
      card:        "summary_large_image",
      title,
      description,
      images:      [`https://aistaffglobal.com/og-default.png`],
      site:        "@aistaffglobal",
    },
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────
// This page exists solely for OG crawlers. Human visitors are redirected to
// the marketplace with the listing pre-selected via UUID query param so the
// marketplace deep-link handler can highlight the correct card.

export default async function ListingPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const listing  = await fetchListing(slug);

  // Deep-link uses the UUID so the marketplace can reliably look up the listing.
  const listingId = listing?.id ?? slug;
  redirect(`/marketplace?listing=${listingId}`);
}
