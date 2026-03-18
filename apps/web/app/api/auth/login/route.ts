/**
 * GET /api/auth/login
 *
 * Legacy redirect — this intermediate route has been replaced by
 * the loginWithProvider() Server Action in app/login/actions.ts.
 *
 * Old browser caches may still navigate here. Redirect to /login
 * so the user lands on the current login page (which uses the
 * Server Action flow and has no CSRF issues).
 */

import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const callbackUrl = req.nextUrl.searchParams.get("callbackUrl") ?? "/dashboard";
  const safe = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
    ? callbackUrl
    : "/dashboard";

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search   = "";
  url.searchParams.set("next", safe);
  return NextResponse.redirect(url, 302);
}
