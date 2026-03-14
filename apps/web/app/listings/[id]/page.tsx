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
}

// ── Data fetcher ─────────────────────────────────────────────────────────────

async function fetchListing(id: string): Promise<ListingData | null> {
  const marketplaceUrl =
    process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

  try {
    const res = await fetch(`${marketplaceUrl}/listings/${id}`, {
      next: { revalidate: 60 },    // ISR — cache 60 seconds
    });
    if (!res.ok) return null;
    return (await res.json()) as ListingData;
  } catch {
    return null;
  }
}

// ── Open Graph metadata ───────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id }  = await params;
  const listing = await fetchListing(id);

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

  const canonicalUrl = `https://aistaffglobal.com/listings/${id}`;

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
// the marketplace with the listing pre-selected via query param.

export default async function ListingPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  redirect(`/marketplace?listing=${id}`);
}
