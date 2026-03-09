import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// Routes that require a valid session
const PROTECTED = [
  "/dashboard", "/marketplace", "/leaderboard", "/deployments", "/profile",
  "/matching", "/scoping", "/outcomes", "/proposals", "/pricing-tool", "/hybrid-match",
  "/escrow", "/payouts", "/billing", "/smart-contracts", "/outcome-listings", "/pricing-calculator",
  "/work-diaries", "/async-collab", "/collab", "/success-layer", "/quality-gate",
  "/legal-toolkit", "/tax-engine", "/reputation-export", "/transparency",
  "/notifications", "/reminders", "/notification-settings",
  "/vertical", "/enterprise", "/global",
  "/proof-of-human",
];

// Routes only for unauthenticated users
const AUTH_ONLY = ["/login"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  const isAuthOnly  = AUTH_ONLY.some((p) => pathname.startsWith(p));

  // Unauthenticated user hitting a protected route → redirect to /login
  if (isProtected && !token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated user hitting /login → redirect to /dashboard
  if (isAuthOnly && token) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     *  - _next/static, _next/image (Next.js internals)
     *  - favicon.ico
     *  - /api/auth/* (login/logout endpoints must be publicly reachable)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/auth).*)",
  ],
};
