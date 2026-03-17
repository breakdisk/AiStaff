/**
 * GET /listings/[slug]
 *
 * Route Handler — replaces page.tsx so Next.js never touches metadata
 * inheritance.  This guarantees the HTML we serve contains ONLY the
 * exact OG tags we write — no parent layout, no og:image bleed-through.
 *
 * Behaviour:
 *   Bot (facebookexternalhit, Googlebot, …)
 *     → 200 HTML with og:url + og:title + og:description, NO og:image
 *   Human browser
 *     → 302 redirect to /marketplace?listing={id}
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ListingData {
  id:          string;
  name:        string;
  description: string;
  price_cents: number;
  category:    string;
  seller_type: string;
  slug:        string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BOT_UA =
  /facebookexternalhit|facebot|twitterbot|linkedinbot|whatsapp|slackbot|telegrambot|discordbot|applebot|googlebot|bingbot/i;

async function fetchListing(slugOrId: string): Promise<ListingData | null> {
  const base = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";
  const url  = UUID_RE.test(slugOrId)
    ? `${base}/listings/${slugOrId}`
    : `${base}/listings/by-slug/${slugOrId}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as ListingData;
  } catch {
    return null;
  }
}

function fmtUSD(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style:               "currency",
    currency:            "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Escape characters that are unsafe in HTML attribute values and text. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(
  req:     NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug }   = await context.params;
  const userAgent  = req.headers.get("user-agent") ?? "";
  const isBot      = BOT_UA.test(userAgent);

  const listing    = await fetchListing(slug);
  const listingId  = listing?.id ?? slug;
  const marketUrl  = `/marketplace?listing=${encodeURIComponent(listingId)}`;

  // ── Human visitor → redirect immediately ────────────────────────────────────
  if (!isBot) {
    return NextResponse.redirect(
      new URL(marketUrl, req.nextUrl.origin),
      { status: 302 },
    );
  }

  // ── Social crawler → serve raw HTML ─────────────────────────────────────────
  // We build the HTML string ourselves so Next.js NEVER injects any parent
  // layout metadata (og:image, twitter:image etc.).  Only the three tags below
  // are emitted: og:url, og:title, og:description.

  if (!listing) {
    return new NextResponse("Not found", { status: 404 });
  }

  const price        = fmtUSD(listing.price_cents);
  const canonicalSlug = listing.slug || listing.id;
  const canonicalUrl  = `https://aistaffglobal.com/listings/${esc(canonicalSlug)}`;

  // og:title  → "Product Name — $Price"
  // og:description → "$Price escrow · first 200 chars of description"
  const ogTitle = esc(`${listing.name} — ${price}`);
  const ogDesc  = esc(`${price} escrow · ${listing.description.slice(0, 200)}`);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ogTitle}</title>
<meta name="description" content="${ogDesc}">

<!-- Open Graph — og:url + og:title + og:description ONLY. No og:image. -->
<meta property="og:type"        content="website">
<meta property="og:url"         content="${canonicalUrl}">
<meta property="og:title"       content="${ogTitle}">
<meta property="og:description" content="${ogDesc}">
<meta property="og:site_name"   content="AiStaff">

<link rel="canonical" href="${canonicalUrl}">

<!-- Human fallback: redirect to marketplace deep-link -->
<meta http-equiv="refresh" content="0;url=${esc(marketUrl)}">
</head>
<body style="background:#09090b;color:#fafafa;font-family:monospace;
             min-height:100vh;display:flex;align-items:center;
             justify-content:center;padding:2rem">
  <div style="max-width:480px;width:100%">
    <p style="font-size:10px;color:#71717a;text-transform:uppercase;
              letter-spacing:.1em;margin:0 0 8px">
      ${esc(listing.category)} &middot; ${esc(listing.seller_type)}
    </p>
    <h1 style="font-size:20px;margin:0 0 8px;color:#fafafa">
      ${esc(listing.name)}
    </h1>
    <p style="font-size:14px;color:#fbbf24;margin:0 0 16px">
      ${esc(price)} escrow
    </p>
    <p style="font-size:14px;color:#a1a1aa;margin:0 0 24px;line-height:1.6">
      ${esc(listing.description)}
    </p>
    <a href="${esc(marketUrl)}"
       style="font-size:13px;color:#fbbf24;text-decoration:none">
      View on AiStaff marketplace &rarr;
    </a>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status:  200,
    headers: {
      "Content-Type":  "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
