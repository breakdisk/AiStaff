"use server";

import { signIn }    from "@/auth";
import { AuthError } from "next-auth";
import { redirect }  from "next/navigation";

/**
 * Server Action — called by the auto-submit form on /magic-verify.
 * Running in a Server Action context allows Auth.js to write the session cookie.
 * Calling signIn() directly from a Server Component page (GET render) fails
 * because Next.js blocks cookie mutation during page rendering.
 */
export async function verifyMagicLink(formData: FormData) {
  const email       = (formData.get("email")       as string) ?? "";
  const token       = (formData.get("token")       as string) ?? "";
  const callbackUrl = (formData.get("callbackUrl") as string) ?? "/dashboard";

  if (!email || !token) {
    redirect("/login?error=InvalidMagicLink");
  }

  try {
    // On success Auth.js writes the session cookie and throws NEXT_REDIRECT.
    // Re-throwing lets Next.js perform the redirect.
    await signIn("magic", { email, token, redirectTo: callbackUrl });
  } catch (err) {
    if (err instanceof AuthError) {
      redirect("/login?error=InvalidMagicLink");
    }
    throw err; // re-throw NEXT_REDIRECT so Next.js follows it
  }
}
