/**
 * middleware.ts — Edge-compatible session guard.
 *
 * WHY getToken instead of NextAuth(authConfig).auth:
 *   auth.ts creates sessions using a NextAuth instance that includes an
 *   adapter + Nodemailer provider. A *second* NextAuth(authConfig) instance
 *   in middleware (without adapter) can diverge in internal state, causing
 *   JWT decryption mismatches — sessions set by auth.ts become unreadable
 *   here. Using getToken() from @auth/core/jwt reads the cookie directly
 *   with the same secret + salt (= cookie name) that auth.ts uses, with
 *   no second instance involved. @auth/core/jwt uses only `jose` and
 *   `@panva/hkdf` — fully Edge-compatible, no Node.js built-ins.
 */

import { getToken } from "@auth/core/jwt";
import { type NextRequest, NextResponse } from "next/server";

// Cookie name must match authConfig.cookies.sessionToken.name.
// In production our explicit config sets "authjs.session-token" (no __Secure-
// prefix) so Traefik SSL termination doesn't cause a mismatch.
// In dev (HTTP) Auth.js also defaults to "authjs.session-token".
const SESSION_COOKIE = "authjs.session-token";

async function readToken(req: NextRequest) {
  return getToken({
    req:        req as unknown as Parameters<typeof getToken>[0]["req"],
    secret:     process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "",
    cookieName: SESSION_COOKIE,
    // salt defaults to cookieName automatically — matches auth.ts encode
  });
}

// Routes only accessible to unauthenticated users
const AUTH_ONLY = ["/login"];

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await readToken(req);
  const isAuthenticated = !!token;

  // Public paths — no session required.
  // NOTE: /listings/* is excluded from the matcher entirely so it never
  // reaches this middleware — social crawlers are guaranteed to pass through.
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/og") ||
    pathname.startsWith("/api/stripe/webhook") ||
    pathname.startsWith("/api/network-intl/webhook") ||
    pathname.startsWith("/api/network-intl/callback") ||
    pathname.startsWith("/api/network-intl/diag") ||
    pathname.startsWith("/sign/") ||
    pathname.startsWith("/api/sign/") ||
    pathname.startsWith("/sign-contract/") ||
    pathname.startsWith("/api/generate-pdf") ||
    (pathname.startsWith("/api/compliance/contracts/") &&
      (pathname.endsWith("/preview") || pathname.endsWith("/sign-external"))) ||
    pathname.startsWith("/talent/") ||
    pathname.startsWith("/api/talent/") ||
    pathname === "/transparency" ||
    pathname === "/pricing-tool" ||
    pathname === "/proof-of-human" ||
    pathname === "/terms" ||
    pathname === "/privacy" ||
    pathname === "/data-deletion" ||
    pathname === "/api/announcements" ||
    pathname === "/opengraph-image" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf)$/i.test(pathname);

  if (!isAuthenticated && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname + (req.nextUrl.search ?? ""));
    return NextResponse.redirect(url);
  }

  // Admin gate — /admin/* requires isAdmin: true in JWT
  if (isAuthenticated && pathname.startsWith("/admin")) {
    if (!token?.isAdmin) {
      if (pathname.startsWith("/api/admin")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  // Authenticated users are redirected away from /login
  if (isAuthenticated && AUTH_ONLY.some((p) => pathname.startsWith(p))) {
    const url         = req.nextUrl.clone();
    const accountType = token?.accountType as string | undefined;
    const role        = token?.role        as string | null | undefined;

    if (!role) {
      url.pathname = "/onboarding";
    } else if (accountType === "agency" || role === "agent-owner") {
      url.pathname = "/dashboard";
    } else if (role === "client") {
      url.pathname = "/marketplace";
    } else {
      url.pathname = "/dashboard";
    }

    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/auth|api/og|favicon\\.ico|icon|apple-icon|opengraph-image|sitemap\\.xml|robots\\.txt|llms.*|listings/.*|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf)$).*)",
  ],
};
