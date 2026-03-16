// Force dynamic — never let Next.js cache auth routes (SSG/ISR).
// Combined with Cache-Control headers in next.config.ts, this ensures
// Cloudflare and other CDNs always hit the origin for auth requests.
export const dynamic = "force-dynamic";

import { handlers } from "@/auth";
import { NextRequest } from "next/server";

const { GET: authGET, POST: authPOST } = handlers;

// Intercept Auth.js responses — it doesn't throw exceptions,
// it silently redirects to /api/auth/error. We catch that redirect
// and return the details as JSON for debugging.
// TODO: revert to simple `export const { GET, POST } = handlers` before launch.

export async function GET(req: NextRequest) {
  // Capture incoming state for diagnostics
  const incomingCookieNames = req.cookies.getAll().map((c) => c.name);
  const incomingHeaders = {
    host: req.headers.get("host"),
    x_forwarded_host: req.headers.get("x-forwarded-host"),
    x_forwarded_proto: req.headers.get("x-forwarded-proto"),
    x_forwarded_for: req.headers.get("x-forwarded-for"),
    cf_ray: req.headers.get("cf-ray"),
  };

  const res = await authGET(req);
  // Check if Auth.js is redirecting to the error page
  const location = res.headers.get("location") ?? "";
  if (location.includes("/api/auth/error")) {
    return Response.json({
      debug: "Auth.js redirected to error page",
      phase: req.url.includes("/callback/") ? "CALLBACK" : "SIGNIN",
      location,
      status: res.status,
      request_url: req.url,
      incoming_cookies: incomingCookieNames,
      incoming_headers: incomingHeaders,
      env_check: {
        AUTH_URL: process.env.AUTH_URL ?? "NOT SET",
        NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "NOT SET",
        AUTH_SECRET_SET: !!process.env.AUTH_SECRET,
        NEXTAUTH_SECRET_SET: !!process.env.NEXTAUTH_SECRET,
        GITHUB_CLIENT_ID_SET: !!process.env.GITHUB_CLIENT_ID,
      },
      cookies_set: res.headers.getSetCookie(),
      all_response_headers: Object.fromEntries(res.headers.entries()),
    }, { status: 500 });
  }
  return res;
}

export async function POST(req: NextRequest) {
  const incomingCookieNames = req.cookies.getAll().map((c) => c.name);

  const res = await authPOST(req);
  const location = res.headers.get("location") ?? "";
  if (location.includes("/api/auth/error")) {
    return Response.json({
      debug: "Auth.js redirected to error page (POST)",
      location,
      status: res.status,
      request_url: req.url,
      incoming_cookies: incomingCookieNames,
      cookies_set: res.headers.getSetCookie(),
      all_response_headers: Object.fromEntries(res.headers.entries()),
    }, { status: 500 });
  }
  return res;
}
