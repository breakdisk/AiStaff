import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Routes only accessible to unauthenticated users
const AUTH_ONLY = ["/login"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthenticated = !!req.auth;

  // Public paths — no session required
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf)$/i.test(pathname);

  if (!isAuthenticated && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf)$).*)"],
};
