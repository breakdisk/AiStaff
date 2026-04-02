/**
 * auth.ts — Single NextAuth instance, fully Edge-compatible.
 *
 * Nodemailer and pg were removed so middleware.ts can import { auth } from
 * "@/auth" directly (single instance, proven to work). Magic link is
 * implemented via a Credentials provider that verifies a short-lived HMAC
 * token signed with AUTH_SECRET — no adapter, no database lookup here.
 * The token is generated and the email is sent in the Server Action
 * (apps/web/app/login/actions.ts) which runs in Node.js runtime.
 */

import NextAuth    from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { jwtVerify } from "jose";
import { authConfig } from "@/auth.config";

// ── Signing key for magic link tokens ────────────────────────────────────────
// Derived from AUTH_SECRET so no extra env var is needed.
function magicKey(): Uint8Array {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "",
  );
}

// ── Single NextAuth instance ──────────────────────────────────────────────────
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    ...(authConfig.providers ?? []),

    // Magic link — user receives a signed JWT via email; clicking the link
    // calls signIn("magic", { email, token }) from /magic-verify page.
    Credentials({
      id:   "magic",
      name: "Magic Link",
      credentials: {
        email: { label: "Email", type: "email" },
        token: { label: "Token", type: "text"  },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const token = credentials?.token as string | undefined;
        if (!email || !token) return null;
        try {
          const { payload } = await jwtVerify(token, magicKey());
          if (payload.email !== email) return null;
          return { id: email, email };
        } catch {
          return null; // expired or tampered token
        }
      },
    }),
  ],
});
