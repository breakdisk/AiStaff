/**
 * /magic-verify — Magic link landing page.
 *
 * The email contains a link like:
 *   https://aistaffglobal.com/magic-verify?email=...&token=...&next=/dashboard
 *
 * This server component calls signIn("magic", {email, token}) which routes
 * through the Credentials("magic") provider in auth.ts. The provider verifies
 * the HMAC-signed JWT and, on success, Auth.js creates a session and redirects
 * to `next` (callbackUrl).
 *
 * On failure the user is sent back to /login with an error flag.
 */

import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

interface Props {
  searchParams: Promise<{
    email?: string;
    token?: string;
    next?:  string;
  }>;
}

export default async function MagicVerifyPage({ searchParams }: Props) {
  const params      = await searchParams;
  const email       = params.email       ?? "";
  const token       = params.token       ?? "";
  const callbackUrl = params.next        ?? "/dashboard";

  if (!email || !token) {
    redirect("/login?error=InvalidMagicLink");
  }

  try {
    // On success, signIn redirects to callbackUrl (throws NEXT_REDIRECT).
    // On failure, it throws AuthError — we catch that and send back to /login.
    await signIn("magic", { email, token, redirectTo: callbackUrl });
  } catch (err) {
    if (err instanceof AuthError) {
      redirect("/login?error=InvalidMagicLink");
    }
    // NEXT_REDIRECT and other Next.js internals — re-throw so Next.js handles them.
    throw err;
  }
}
