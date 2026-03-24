import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Routes only accessible to unauthenticated users
const AUTH_ONLY = ["/login"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthenticated = !!req.auth;

  // Public paths — no session required.
  // NOTE: /listings/* is excluded from the matcher entirely so it never
  // reaches this middleware — social crawlers are guaranteed to pass through.
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/og") ||          // OG image — must be public for social crawlers
    pathname.startsWith("/api/stripe/webhook") ||
    pathname.startsWith("/api/network-intl/webhook") ||
    pathname.startsWith("/api/network-intl/callback") ||
    pathname.startsWith("/api/network-intl/diag") ||   // Temporary diagnostic — remove after IP confirmed
    pathname.startsWith("/sign/") ||              // Public e-signature page (token-gated, no auth)
    pathname.startsWith("/api/sign/") ||          // Public e-signature API proxy
    pathname.startsWith("/sign-contract/") ||     // Contract sign page — party B, no account needed
    pathname.startsWith("/api/generate-pdf") ||   // PDF generation — called from public sign page
    // Contract preview + external sign — token-gated in compliance_service, no session required
    (pathname.startsWith("/api/compliance/contracts/") &&
      (pathname.endsWith("/preview") || pathname.endsWith("/sign-external"))) ||
    pathname.startsWith("/talent/") ||           // Public talent profiles
    pathname.startsWith("/api/talent/") ||       // Public talent API (profile + privacy GET/PATCH)
    pathname === "/transparency" ||              // (marketing) — public trust page
    pathname === "/pricing-tool" ||              // (marketing) — public pricing reference
    pathname === "/proof-of-human" ||            // (marketing) — public PoH methodology
    pathname === "/terms" ||                     // Terms of Service — public
    pathname === "/privacy" ||                   // Privacy Policy — public
    pathname === "/data-deletion" ||             // Data Deletion Instructions — required by Facebook OAuth
    pathname === "/api/announcements" ||         // Public system announcements — no auth required
    pathname === "/opengraph-image" ||           // OG image — must be public for social crawlers (Meta, Twitter, LinkedIn)
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf)$/i.test(pathname);

  if (!isAuthenticated && !isPublic) {
    // API routes must return 401 — never redirect to login.
    // Redirecting an API POST to /login causes NextAuth to replay it as
    // a GET after authentication, hitting a non-existent route → 404.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    // Preserve full path + search so query params (e.g. ?listing=UUID) survive
    // the login round-trip — the login page passes this as callbackUrl to signIn().
    url.searchParams.set("next", pathname + (req.nextUrl.search ?? ""));
    return NextResponse.redirect(url);
  }

  // Admin gate — /admin/* requires isAdmin: true in session
  if (isAuthenticated && pathname.startsWith("/admin")) {
    const user = req.auth?.user as { isAdmin?: boolean } | undefined;
    if (!user?.isAdmin) {
      // API admin routes return 403; page routes redirect to dashboard
      if (pathname.startsWith("/api/admin")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  if (isAuthenticated && AUTH_ONLY.some((p) => pathname.startsWith(p))) {
    const url   = req.nextUrl.clone();
    const token = req.auth?.user as {
      accountType?: string;
      role?:        string | null;
    } | undefined;

    const accountType = token?.accountType;
    const role        = token?.role;

    // New user — no role set yet → send to onboarding
    if (!role) {
      url.pathname = "/onboarding";
    // Agency owner
    } else if (accountType === "agency" || role === "agent-owner") {
      url.pathname = "/dashboard";
    // Client / buyer
    } else if (role === "client") {
      url.pathname = "/marketplace";
    // Freelancer / talent (default)
    } else {
      url.pathname = "/dashboard";
    }

    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Exclude from the matcher:
    //   - _next/static, _next/image  — Next.js build assets
    //   - /api/auth/*                — Auth.js callback + signin routes must
    //                                  NEVER pass through the auth() middleware
    //                                  wrapper.  The middleware calls auth() to
    //                                  read the session, but auth() also attempts
    //                                  to decrypt OAuth state cookies.  On the
    //                                  callback URL this happens BEFORE the route
    //                                  handler, so if cookie decryption fails
    //                                  (Traefik HTTP-internal vs HTTPS-external
    //                                  mismatch) Auth.js logs InvalidCheck and
    //                                  aborts — the route handler never runs.
    //                                  Excluding /api/auth/* from the matcher
    //                                  lets the route handler process the OAuth
    //                                  callback with no middleware interference.
    //   - /listings/*               — OG share pages for social crawlers
    //   - Static file extensions    — images, fonts, favicons
    "/((?!_next/static|_next/image|api/auth|api/og|favicon\\.ico|icon|apple-icon|opengraph-image|sitemap\\.xml|robots\\.txt|llms.*|listings/.*|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf)$).*)",
  ],
};
