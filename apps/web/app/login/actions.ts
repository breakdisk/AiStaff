"use server";

/**
 * Server action for magic-link email sign-in.
 *
 * Auth.js v5 requires signIn() to be called on the server (Node.js runtime).
 * Calling it from a Server Action avoids CSRF token wrangling and the
 * nodemailer/stream module restriction in the Edge runtime.
 */

export async function sendMagicLink(
  email: string,
  callbackUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Dynamic import keeps this out of the Edge runtime bundle.
    const { signIn } = await import("@/auth");

    // redirect: false → Auth.js sends the email and returns instead of throwing
    // a NEXT_REDIRECT. On some beta versions it still throws the redirect —
    // isRedirectError catches that as a success path.
    await signIn("nodemailer", { email, callbackUrl, redirect: false });
    return { ok: true };
  } catch (err: unknown) {
    // Auth.js sometimes throws a Next.js redirect even with redirect:false.
    // That still means the email was sent successfully.
    const msg = String(err);
    if (msg.includes("NEXT_REDIRECT") || msg.includes("NEXT_NOT_FOUND")) {
      return { ok: true };
    }
    console.error("[magic-link] sendMagicLink error:", err);
    return { ok: false, error: msg };
  }
}
