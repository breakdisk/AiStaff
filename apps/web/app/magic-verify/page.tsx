/**
 * /magic-verify — Magic link landing page.
 *
 * The user arrives here via a GET link from their email. We cannot call
 * signIn() directly in a Server Component page because Next.js blocks cookie
 * writes during page rendering (GET requests are read-only for cookies).
 *
 * Solution: render an invisible auto-submitting form whose `action` is a
 * Server Action. Form submissions run in a mutation context where Auth.js can
 * write the session cookie and redirect.
 */

import { verifyMagicLink } from "./actions";
import { Loader2 } from "lucide-react";

interface Props {
  searchParams: Promise<{
    email?: string;
    token?: string;
    next?:  string;
  }>;
}

export default async function MagicVerifyPage({ searchParams }: Props) {
  const params      = await searchParams;
  const email       = params.email ?? "";
  const token       = params.token ?? "";
  const callbackUrl = params.next  ?? "/dashboard";

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
      <p className="font-mono text-sm text-zinc-400">Signing you in…</p>

      {/* Auto-submit form — Server Action handles signIn + cookie write */}
      <form action={verifyMagicLink} id="magic-form">
        <input type="hidden" name="email"       value={email} />
        <input type="hidden" name="token"       value={token} />
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <button type="submit" className="hidden" id="magic-btn" />
      </form>

      {/* Submit on load — works even if user has JS disabled via noscript fallback */}
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById("magic-btn").click();`,
        }}
      />
      <noscript>
        <p style={{ color: "#a1a1aa", fontFamily: "monospace", fontSize: 13 }}>
          JavaScript is required to complete sign-in.{" "}
          <button form="magic-form" type="submit" style={{ color: "#fbbf24" }}>
            Click here to continue
          </button>
        </p>
      </noscript>
    </div>
  );
}
