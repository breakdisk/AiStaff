// Force dynamic — never let Next.js cache auth routes (SSG/ISR).
// Combined with Cache-Control headers in next.config.ts, this ensures
// Cloudflare and other CDNs always hit the origin for auth requests.
export const dynamic = "force-dynamic";

import { handlers } from "@/auth";
import { NextRequest } from "next/server";

const { GET: authGET, POST: authPOST } = handlers;

// Stale cookies from previous useSecureCookies configurations.
// Delete them on every auth response so they stop polluting requests.
const STALE_COOKIE_NAMES = [
  "__Host-authjs.csrf-token",
  "__Secure-authjs.callback-url",
  "__Secure-authjs.session-token",
  "__Secure-authjs.pkce.code_verifier",
  "__Secure-authjs.state",
];

/** Clone response and append Set-Cookie headers to delete stale cookies. */
function clearStaleCookies(res: Response, req: NextRequest): Response {
  // Only clear cookies that are actually present in the request
  const toDelete = STALE_COOKIE_NAMES.filter((name) => req.cookies.has(name));
  if (toDelete.length === 0) return res;

  const headers = new Headers(res.headers);
  for (const name of toDelete) {
    headers.append(
      "Set-Cookie",
      `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
    );
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

// Intercept Auth.js responses — it doesn't throw exceptions,
// it silently redirects to /api/auth/error. We catch that redirect
// and return the details as JSON for debugging.
// TODO: revert to simple `export const { GET, POST } = handlers` before launch.

export async function GET(req: NextRequest) {
  const res = await authGET(req);
  const location = res.headers.get("location") ?? "";

  if (location.includes("/api/auth/error")) {
    // Diagnostic output for debugging
    return Response.json({
      debug: "Auth.js redirected to error page",
      phase: req.url.includes("/callback/") ? "CALLBACK" : "SIGNIN",
      location,
      status: res.status,
      request_url: req.url,
      incoming_cookies: req.cookies.getAll().map((c) => c.name),
      env_check: {
        AUTH_URL: process.env.AUTH_URL ?? "NOT SET",
        AUTH_SECRET_SET: !!process.env.AUTH_SECRET,
        GITHUB_CLIENT_ID_SET: !!process.env.GITHUB_CLIENT_ID,
      },
      cookies_set: res.headers.getSetCookie(),
      all_response_headers: Object.fromEntries(res.headers.entries()),
    }, { status: 500 });
  }

  return clearStaleCookies(res, req);
}

export async function POST(req: NextRequest) {
  const res = await authPOST(req);
  const location = res.headers.get("location") ?? "";

  if (location.includes("/api/auth/error")) {
    return Response.json({
      debug: "Auth.js redirected to error page (POST)",
      location,
      status: res.status,
      request_url: req.url,
      incoming_cookies: req.cookies.getAll().map((c) => c.name),
      cookies_set: res.headers.getSetCookie(),
      all_response_headers: Object.fromEntries(res.headers.entries()),
    }, { status: 500 });
  }

  return clearStaleCookies(res, req);
}
