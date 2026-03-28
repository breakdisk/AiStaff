// Single auth instance — auth.ts is now fully Edge-compatible (no nodemailer,
// no pg) so we can import directly here without a second NextAuth() instance.
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
    pathname.startsWith("/magic-verify") ||       // magic link landing page
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
    // API routes must return 401 — never redirect to login.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname + (req.nextUrl.search ?? ""));
    return NextResponse.redirect(url);
  }

  // Admin gate — /admin/* requires isAdmin: true in session
  if (isAuthenticated && pathname.startsWith("/admin")) {
    const user = req.auth?.user as { isAdmin?: boolean } | undefined;
    if (!user?.isAdmin) {
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
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/auth|api/og|favicon\\.ico|icon|apple-icon|opengraph-image|sitemap\\.xml|robots\\.txt|llms.*|listings/.*|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf)$).*)",
  ],
};
