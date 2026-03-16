/**
 * /api/auth/login?provider=github&callbackUrl=/dashboard
 *
 * Intermediate OAuth entry point that eliminates the fetch() race condition
 * on mobile. next-auth/react's signIn() uses fetch() to POST to
 * /api/auth/signin/{provider}. On mobile, window.location.href sometimes
 * starts before the browser stores the Set-Cookie from the fetch() response,
 * so the PKCE cookie is missing on the callback → InvalidCheck error.
 *
 * This route uses only full browser navigations:
 *   GET /api/auth/login → HTML page with auto-submitting form
 *   Browser submits form → POST /api/auth/signin/{provider}
 *   Auth.js sets PKCE cookie → 302 to OAuth provider
 *   Browser stores cookie synchronously in the redirect chain → callback works.
 */

import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_PROVIDERS = ["github", "google", "linkedin"] as const;
type Provider = (typeof ALLOWED_PROVIDERS)[number];

function isAllowedProvider(p: string): p is Provider {
  return (ALLOWED_PROVIDERS as readonly string[]).includes(p);
}

/** Callback URL must be a relative path — block open-redirect attempts. */
function sanitizeCallback(raw: string): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//")) return "/dashboard";
  return raw;
}

/** Minimal HTML attribute escaping. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function GET(req: NextRequest) {
  const provider    = req.nextUrl.searchParams.get("provider")    ?? "";
  const callbackUrl = req.nextUrl.searchParams.get("callbackUrl") ?? "/dashboard";

  if (!isAllowedProvider(provider)) {
    return new NextResponse("Invalid provider", { status: 400 });
  }

  const safeCallback = sanitizeCallback(callbackUrl);

  // Fetch the CSRF token from Auth.js via the internal container address.
  // Using 127.0.0.1:3000 avoids Cloudflare and Traefik entirely.
  let csrfToken = "";
  let csrfSetCookie: string | null = null;

  try {
    const csrfRes = await fetch("http://127.0.0.1:3000/api/auth/csrf");
    if (csrfRes.ok) {
      const data = await csrfRes.json() as { csrfToken?: string };
      csrfToken     = data.csrfToken ?? "";
      csrfSetCookie = csrfRes.headers.get("set-cookie");
    }
  } catch {
    // Non-fatal — proceed without CSRF token; Auth.js will reject and the
    // user will be redirected back to /login, which is a safe fallback.
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Signing in…</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#09090b;display:flex;align-items:center;justify-content:center;
         min-height:100vh;font-family:ui-monospace,monospace;color:#a1a1aa;font-size:14px}
    p{letter-spacing:.05em}
  </style>
</head>
<body>
  <p>Signing in…</p>
  <form id="f" method="POST" action="/api/auth/signin/${esc(provider)}">
    <input type="hidden" name="csrfToken"   value="${esc(csrfToken)}">
    <input type="hidden" name="callbackUrl" value="${esc(safeCallback)}">
  </form>
  <script>document.getElementById("f").submit();</script>
</body>
</html>`;

  const res = new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

  // Forward the CSRF Set-Cookie from Auth.js so the browser has the matching
  // cookie when the auto-submitted form POST arrives at /api/auth/signin.
  if (csrfSetCookie) {
    res.headers.set("set-cookie", csrfSetCookie);
  }

  return res;
}
