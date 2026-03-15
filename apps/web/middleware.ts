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
    pathname.startsWith("/api/stripe/webhook") || // Stripe calls this — no user session
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
    // Exclude: static assets, images, AND /listings/* (OG share pages must be
    // reachable by social crawlers without any auth — excluding them from the
    // matcher is the only way to guarantee NextAuth never touches these routes).
    "/((?!_next/static|_next/image|favicon\\.ico|icon|apple-icon|sitemap\\.xml|robots\\.txt|llms.*|listings/.*|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf)$).*)",
  ],
};
