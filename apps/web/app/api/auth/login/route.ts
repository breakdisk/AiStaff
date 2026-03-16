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

  // Redirect to the Auth.js sign-in endpoint for the chosen provider.
  // Auth.js will:
  //   1. Generate a state token and set the authjs.state cookie (SameSite=None;Secure).
  //   2. Redirect the browser to the OAuth provider with ?state=...
  //   3. On callback, read authjs.state to verify the round-trip.
  // Because this is a GET redirect (not a fetch()), the browser stores the
  // Set-Cookie synchronously before following the next redirect — eliminating
  // the mobile race condition that existed with signIn() fetch() calls.
  const signinUrl = new URL(
    `/api/auth/signin/${provider}`,
    req.nextUrl.origin,
  );
  signinUrl.searchParams.set("callbackUrl", safeCallback);

  return NextResponse.redirect(signinUrl, { status: 302 });
}
