/**
 * /api/auth/login?provider=github&callbackUrl=/dashboard
 *
 * Lightweight redirect shim. The login page navigates here instead of calling
 * next-auth/react signIn() directly, so the entire flow is full browser
 * navigations with no fetch() race conditions.
 *
 * With checks:["state"] (PKCE disabled) there is no code_verifier cookie to
 * lose, so the only thing this route needs to do is validate inputs and issue
 * a 302 to the standard Auth.js signin endpoint — which sets the state cookie
 * itself as part of the same redirect chain.
 *
 * Previous version fetched CSRF via http://127.0.0.1:3000 then forwarded the
 * Set-Cookie header. That caused a domain mismatch: the cookie was bound to
 * 127.0.0.1 but the browser page was on aistaffglobal.com, so browsers
 * silently dropped it → CSRF validation failed. This version avoids that
 * entirely by letting Auth.js manage its own CSRF cookie.
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

export async function GET(req: NextRequest) {
  const provider    = req.nextUrl.searchParams.get("provider")    ?? "";
  const callbackUrl = req.nextUrl.searchParams.get("callbackUrl") ?? "/dashboard";

  if (!isAllowedProvider(provider)) {
    return new NextResponse("Invalid provider", { status: 400 });
  }

  const safeCallback = sanitizeCallback(callbackUrl);

  // Build the redirect URL using the PUBLIC origin from AUTH_URL / NEXTAUTH_URL.
  //
  // IMPORTANT: req.nextUrl.origin is the *container-internal* address
  // (e.g. http://localhost:3000 or http://172.x.x.x:3000) because Traefik
  // terminates TLS and forwards the request to the container over plain HTTP.
  // Using req.nextUrl.origin as the base would send the browser to an
  // internal address it cannot reach ("localhost refused to connect").
  //
  // AUTH_URL / NEXTAUTH_URL is always set to the public HTTPS URL in Dokploy
  // (https://aistaffglobal.com), so we use that as the base instead.
  const publicOrigin = (
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    req.nextUrl.origin          // fallback for local dev where both match
  ).replace(/\/$/, "");

  const signinUrl = new URL(`/api/auth/signin/${provider}`, publicOrigin);
  signinUrl.searchParams.set("callbackUrl", safeCallback);

  // 302 — full browser navigation so Auth.js sets the state cookie
  // synchronously within the redirect chain (no fetch() race condition).
  return NextResponse.redirect(signinUrl, { status: 302 });
}
