import { type Metadata } from "next";
import { redirect }      from "next/navigation";
import { headers }       from "next/headers";

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

// ── Bot / crawler detection ───────────────────────────────────────────────────
// When called by a social crawler (Facebook, Twitter, WhatsApp, LinkedIn, Slack,
// Telegram, Discord) we MUST render HTML so the OG <head> tags are actually
// served.  Calling redirect() sends an HTTP 307 before any HTML is written,
// which means the crawler follows the redirect to /marketplace and never reads
// the listing-specific OG metadata.
// Human visitors still get a fast client-side redirect via <meta http-equiv>.

const BOT_UA =
  /facebookexternalhit|facebot|twitterbot|linkedinbot|whatsapp|slackbot|telegrambot|discordbot|applebot|googlebot|bingbot/i;

function fmtUSD(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function ListingPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug }    = await params;
  const listing     = await fetchListing(slug);
  const listingId   = listing?.id ?? slug;
  const marketplaceUrl = `/marketplace?listing=${listingId}`;

  const hdrs      = await headers();
  const userAgent = hdrs.get("user-agent") ?? "";
  const isBot     = BOT_UA.test(userAgent);

  // Human visitors: server-side redirect to marketplace deep-link.
  if (!isBot) {
    redirect(marketplaceUrl);
  }

  // Social crawlers: render a minimal, styled page so the OG <head> is served.
  // The page also contains a visible link in case any crawler renders JS.
  return (
    <main style={{ fontFamily: "monospace", background: "#09090b", color: "#fafafa",
                   minHeight: "100vh", display: "flex", alignItems: "center",
                   justifyContent: "center", padding: "2rem" }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        {listing ? (
          <>
            <p style={{ fontSize: 10, color: "#71717a", textTransform: "uppercase",
                        letterSpacing: ".1em", margin: "0 0 8px" }}>
              {listing.category} · {listing.seller_type}
            </p>
            <h1 style={{ fontSize: 20, margin: "0 0 8px", color: "#fafafa" }}>
              {listing.name}
            </h1>
            <p style={{ fontSize: 14, color: "#a1a1aa", margin: "0 0 16px",
                        lineHeight: 1.6 }}>
              {listing.description}
            </p>
            <p style={{ fontSize: 14, color: "#fbbf24", margin: "0 0 24px" }}>
              {fmtUSD(listing.price_cents)} escrow
            </p>
          </>
        ) : (
          <p style={{ color: "#a1a1aa" }}>Listing not found.</p>
        )}
        <a href={marketplaceUrl}
           style={{ fontSize: 13, color: "#fbbf24", textDecoration: "none" }}>
          View on AiStaff marketplace →
        </a>
      </div>
      {/* Client-side redirect for any non-bot that slips through */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <meta httpEquiv="refresh" content={`0;url=${marketplaceUrl}`} />
    </main>
  );
}
