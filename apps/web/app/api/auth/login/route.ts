/**
 * /api/auth/login?provider=github&callbackUrl=/dashboard
 *
 * Intermediate OAuth entry point. The login page navigates here (full browser
 * navigation, not fetch()) to avoid the mobile race condition where
 * window.location.href can start before the browser stores the Set-Cookie
 * from a fetch() response.
 *
 * Auth.js v5 only supports POST to /api/auth/signin/{provider} to initiate
 * OAuth (GET returns UnknownAction). This route:
 *   1. Fetches a fresh CSRF token from Auth.js via the container-internal URL,
 *      passing correct public Host headers so the token is scoped correctly.
 *   2. Returns an HTML page with an auto-submitting POST form that includes
 *      the CSRF token and callbackUrl.
 *   3. Forwards the CSRF Set-Cookie header so the browser has the matching
 *      cookie when it submits the form.
 *
 * Auth.js then:
 *   - Validates the CSRF token
 *   - Generates a state token, sets authjs.state cookie
 *   - Redirects to the OAuth provider
 *
 * All steps are full browser navigations — no fetch() race condition.
 */

import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_PROVIDERS = ["github", "google", "linkedin", "facebook", "microsoft-entra-id"] as const;
type Provider = (typeof ALLOWED_PROVIDERS)[number];

function isAllowedProvider(p: string): p is Provider {
  return (ALLOWED_PROVIDERS as readonly string[]).includes(p);
}

/** Block open-redirect: callbackUrl must be a relative path on this origin. */
function sanitizeCallback(raw: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

function escHtml(s: string): string {
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

  // Public origin — used for the form action so the browser POSTs to the
  // correct public URL, not the container-internal address.
  const publicOrigin = (
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    req.nextUrl.origin   // fallback: local dev where these match
  ).replace(/\/$/, "");

  const publicHost = new URL(publicOrigin).host; // e.g. "aistaffglobal.com"

  // ── Fetch CSRF token from Auth.js ─────────────────────────────────────────
  // Use the loopback address so the request stays inside the container (fast,
  // no DNS, no Traefik hop). Pass the public Host + forwarded headers so
  // Auth.js scopes the CSRF hash to aistaffglobal.com, not 127.0.0.1.
  let csrfToken  = "";
  let csrfCookie = "";
  try {
    const csrfRes = await fetch("http://127.0.0.1:3000/api/auth/csrf", {
      cache: "no-store",
      headers: {
        "host":              publicHost,
        "x-forwarded-host":  publicHost,
        "x-forwarded-proto": "https",
        "x-forwarded-for":   req.headers.get("x-forwarded-for") ?? "127.0.0.1",
      },
    });
    if (csrfRes.ok) {
      const data = (await csrfRes.json()) as { csrfToken?: string };
      csrfToken  = data.csrfToken ?? "";
      csrfCookie = csrfRes.headers.get("set-cookie") ?? "";
    }
  } catch {
    // Non-fatal: Auth.js may still accept the POST via Origin-header CSRF
    // validation (used in newer beta builds). If not, it will redirect to
    // the error page instead of silently losing the user.
  }

  // ── Return auto-submitting form ───────────────────────────────────────────
  const formAction = `${escHtml(publicOrigin)}/api/auth/signin/${escHtml(provider)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Signing in…</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#09090b;color:#a1a1aa;font-family:ui-sans-serif,system-ui,sans-serif;
       display:flex;align-items:center;justify-content:center;min-height:100dvh;
       font-size:14px;letter-spacing:.01em}
  p{opacity:.7}
</style>
</head>
<body>
<p>Signing in…</p>
<form id="f" method="POST" action="${formAction}">
  <input type="hidden" name="csrfToken"   value="${escHtml(csrfToken)}">
  <input type="hidden" name="callbackUrl" value="${escHtml(safeCallback)}">
</form>
<script>
  // Submit immediately. Using a form POST (not fetch) means the browser
  // processes Set-Cookie from the Auth.js 302 response before following
  // the redirect to the OAuth provider — no race condition.
  document.getElementById("f").submit();
</script>
</body>
</html>`;

  const res = new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

  // Forward the CSRF cookie Auth.js generated so the browser has it when
  // it submits the form. Without this cookie the CSRF validation fails.
  if (csrfCookie) {
    res.headers.set("set-cookie", csrfCookie);
  }

  return res;
}
