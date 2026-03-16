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
  const res = await authGET(req);
  // Check if Auth.js is redirecting to the error page
  const location = res.headers.get("location") ?? "";
  if (location.includes("/api/auth/error")) {
    return Response.json({
      debug: "Auth.js redirected to error page",
      location,
      status: res.status,
      request_url: req.url,
      cookies_set: res.headers.getSetCookie(),
      all_response_headers: Object.fromEntries(res.headers.entries()),
    }, { status: 500 });
  }
  return res;
}

export async function POST(req: NextRequest) {
  const res = await authPOST(req);
  const location = res.headers.get("location") ?? "";
  if (location.includes("/api/auth/error")) {
    return Response.json({
      debug: "Auth.js redirected to error page",
      location,
      status: res.status,
      request_url: req.url,
      cookies_set: res.headers.getSetCookie(),
      all_response_headers: Object.fromEntries(res.headers.entries()),
    }, { status: 500 });
  }
  return res;
}
