import type { NextConfig } from "next";

// build: 2026-04-02 — force cache bust for portfolio redesign
// ── Service base URLs ──────────────────────────────────────────────────────────
// Defaults to localhost for `npm run dev` / bare `next start`.
// In Docker, pass the container-name URLs via environment:
//   IDENTITY_SERVICE_URL=http://identity-service:3001  etc.
const ID    = process.env.IDENTITY_SERVICE_URL     ?? "http://localhost:3001";
const MKT   = process.env.MARKETPLACE_SERVICE_URL  ?? "http://localhost:3002";
const CHK   = process.env.CHECKLIST_SERVICE_URL    ?? "http://localhost:3003";
const LIC   = process.env.LICENSE_SERVICE_URL      ?? "http://localhost:3004";
const MAT   = process.env.MATCHING_SERVICE_URL     ?? "http://localhost:3005";
const COM   = process.env.COMPLIANCE_SERVICE_URL   ?? "http://localhost:3006";
const TEL   = process.env.TELEMETRY_SERVICE_URL    ?? "http://localhost:3007";
const ANA   = process.env.ANALYTICS_SERVICE_URL    ?? "http://localhost:3008";
const REP   = process.env.REPUTATION_SERVICE_URL   ?? "http://localhost:3009";
const PAY   = process.env.PAYOUT_SERVICE_URL       ?? "http://localhost:3010";
const COMM  = process.env.COMMUNITY_SERVICE_URL    ?? "http://localhost:3011";
const NOTIF = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:3012";

const nextConfig: NextConfig = {
  // pdfkit reads font metric files (AFM) at runtime via fs — must NOT be
  // bundled by webpack or it loses access to its own node_modules assets.
  serverExternalPackages: ["pdfkit"],

  images: {
    remotePatterns: [
      // QR code generator used in notification-settings integrations panel
      { protocol: "https", hostname: "api.qrserver.com" },
    ],
  },

  // ── Prevent Cloudflare (and any CDN) from caching auth API responses ────────
  // Cloudflare strips Set-Cookie headers from cached responses. If /api/auth/csrf
  // is cached, the CSRF cookie is never set → double-submit validation fails →
  // Chrome shows error=Configuration. This header block ensures auth routes are
  // always served fresh from the origin.
  async headers() {
    return [
      {
        source: "/api/auth/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
          { key: "CDN-Cache-Control", value: "no-store" },
          { key: "Cloudflare-CDN-Cache-Control", value: "no-store" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options",           value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options",    value: "nosniff" },
          { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      { source: "/api/identity/:path*",                 destination: `${ID}/:path*` },
      { source: "/api/marketplace/:path*",              destination: `${MKT}/:path*` },
      { source: "/api/checklist/:path*",                destination: `${CHK}/:path*` },
      { source: "/api/license/:path*",                  destination: `${LIC}/:path*` },
      { source: "/api/matching/:path*",                 destination: `${MAT}/:path*` },
      { source: "/api/compliance/:path*",               destination: `${COM}/:path*` },
      { source: "/api/telemetry/:path*",                destination: `${TEL}/:path*` },
      { source: "/api/analytics/:path*",                destination: `${ANA}/:path*` },
      { source: "/api/reputation/:path*",               destination: `${REP}/:path*` },
      { source: "/api/payout/:path*",                   destination: `${PAY}/:path*` },
      { source: "/api/community/:path*",                destination: `${COMM}/:path*` },
      { source: "/api/notifications/:path*",            destination: `${NOTIF}/notifications/:path*` },
      { source: "/api/notification-preferences/:path*", destination: `${NOTIF}/notification-preferences/:path*` },
      { source: "/api/notification-preferences",        destination: `${NOTIF}/notification-preferences` },
      { source: "/api/device-tokens/:path*",            destination: `${NOTIF}/device-tokens/:path*` },
      { source: "/api/device-tokens",                   destination: `${NOTIF}/device-tokens` },
      { source: "/api/integrations/:path*",             destination: `${NOTIF}/integrations/:path*` },
    ];
  },
};

export default nextConfig;
