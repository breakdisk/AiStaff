"use server";

import { signIn } from "@/auth";

/**
 * Server action: initiates OAuth flow via Auth.js server-side signIn().
 *
 * This replaces the client-side signIn() from next-auth/react which uses
 * fetch() internally. Chrome behind Cloudflare does not reliably store
 * Set-Cookie headers from fetch() responses — the OAuth state cookie is
 * lost, causing "InvalidCheck: state value could not be parsed".
 *
 * Server actions use native form submission + server-side redirect, which
 * handles Set-Cookie headers correctly in all browsers.
 */
export async function signInWithProvider(formData: FormData) {
  const provider = formData.get("provider") as string;
  const callbackUrl = (formData.get("callbackUrl") as string) || "/dashboard";
  await signIn(provider, { redirectTo: callbackUrl });
}
