"use server";

/**
 * Server Actions for OAuth sign-in.
 *
 * Auth.js v5 signIn() called from a Server Action does NOT need a CSRF token —
 * Next.js validates Server Actions automatically. This eliminates the fragile
 * "fetch CSRF token internally then forward the cookie" dance in /api/auth/login
 * that produced MissingCSRF errors when the loopback fetch failed on deploy.
 */

import { signIn } from "@/auth";

type Provider = "github" | "google" | "linkedin";

/** Block open-redirect: callbackUrl must be a relative path. */
function sanitize(url: string): string {
  if (!url || !url.startsWith("/") || url.startsWith("//")) return "/dashboard";
  return url;
}

export async function loginWithProvider(provider: Provider, callbackUrl: string) {
  await signIn(provider, { redirectTo: sanitize(callbackUrl) });
}
