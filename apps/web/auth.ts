import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import LinkedIn from "next-auth/providers/linkedin";
import type { Account, Profile } from "next-auth";

// ── identity_service base URL ─────────────────────────────────────────────────

const IDENTITY_URL =
  process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

// ── Payload builder — maps NextAuth provider data → identity_service format ───

interface OAuthCallbackPayload {
  provider: "github" | "google" | "linkedin";
  provider_uid: string;
  email: string;
  display_name: string;
  github_repos?: number;
  github_created_at?: string;
  email_verified?: boolean;
  existing_profile_id?: string;
}

interface OAuthCallbackResponse {
  profile_id:    string;
  identity_tier: "UNVERIFIED" | "SOCIAL_VERIFIED" | "BIOMETRIC_VERIFIED";
  trust_score:   number;
  account_type:  string;         // "individual" | "agency"
  role:          string | null;  // "talent" | "client" | "agent-owner" | null
}

async function callIdentityOAuthCallback(
  account: Account,
  profile: Profile,
  githubExtra?: { public_repos: number; created_at: string }
): Promise<OAuthCallbackResponse> {
  const payload: OAuthCallbackPayload = {
    provider: account.provider as "github" | "google" | "linkedin",
    provider_uid: String(account.providerAccountId),
    email: (profile as { email?: string }).email ?? "",
    display_name: (profile as { name?: string }).name ?? "",
    // Normalise to boolean — LinkedIn sends email_verified as the string "true"
    // which Rust's serde rejects with 422 (expected bool, got string).
    email_verified: (() => {
      const raw = (profile as { email_verified?: unknown }).email_verified;
      if (raw === true || raw === "true") return true;
      if (raw === false || raw === "false") return false;
      return undefined;
    })(),
    github_repos: githubExtra?.public_repos,
    github_created_at: githubExtra?.created_at,
  };

  try {
    const res = await fetch(`${IDENTITY_URL}/identity/oauth-callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) return res.json() as Promise<OAuthCallbackResponse>;
    // Fall back gracefully if identity_service is unreachable
    const msg = await res.text().catch(() => "unknown");
    console.warn(`[auth] identity_service ${res.status}: ${msg}`);
  } catch (err) {
    console.warn("[auth] identity_service unreachable:", err);
  }

  // Fallback: return Unverified tier so login still succeeds
  return {
    profile_id:   account.providerAccountId,
    identity_tier: "UNVERIFIED",
    trust_score:  0,
    account_type: "individual",
    role:         null,
  };
}

// ── NextAuth config ───────────────────────────────────────────────────────────

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Explicit secret — Auth.js v5 uses AUTH_SECRET, but many deployments still
  // set NEXTAUTH_SECRET (v4 name). Accept either to avoid silent MissingSecret
  // errors that surface as "error=Configuration" with no useful diagnostics.
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,

  // Trust X-Forwarded-Host / X-Forwarded-Proto from Traefik reverse proxy.
  // Without this, NextAuth v5 rejects requests where the internal container
  // host differs from the forwarded host — causes "Server Error / server
  // configuration" on mobile and behind any reverse proxy.
  trustHost: true,
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    LinkedIn({
      clientId: process.env.LINKEDIN_CLIENT_ID!,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  ],

  session: { strategy: "jwt" },

  // Do NOT set useSecureCookies here — Auth.js v5 performs an internal protocol
  // check that fails when the origin server receives HTTP (Cloudflare Flexible
  // SSL terminates TLS at the edge, forwarding plain HTTP to the container).
  // Instead, set secure:true explicitly on each cookie below. This achieves the
  // same browser behavior (Chrome requires Secure flag on __Secure- cookies)
  // without triggering the server-side protocol assertion.
  //
  // Manual cookie config — every cookie uses __Secure- prefix + secure:true.
  // Chrome enforces prefix rules strictly; Edge is lenient. Both need this.
  cookies: {
    sessionToken: {
      name:    `__Secure-authjs.session-token`,
      options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: true },
    },
    callbackUrl: {
      name:    `__Secure-authjs.callback-url`,
      options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: true },
    },
    csrfToken: {
      // __Secure- prefix (not __Host-): Cloudflare Flexible SSL means the origin
      // server receives HTTP internally — Chrome rejects __Host- cookies set over
      // HTTP even when the browser connection is HTTPS. __Secure- only requires
      // the Secure flag + HTTPS delivery to the browser, which Cloudflare provides.
      name:    `__Secure-authjs.csrf-token`,
      options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: true },
    },
    pkceCodeVerifier: {
      name:    `__Secure-authjs.pkce.code_verifier`,
      options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: true, maxAge: 60 * 15 },
    },
    state: {
      name:    `__Secure-authjs.state`,
      options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: true, maxAge: 60 * 15 },
    },
  },

  callbacks: {
    async jwt({ token, account, profile, trigger, session }) {
      // ── Session update: client called update({ role, accountType }) ──────────
      // Fired after onboarding writes a new role to the backend.
      // We trust the client payload here because it only updates non-privileged
      // display fields — the authoritative role lives in the DB and will be
      // re-read from identity_service on the next full sign-in.
      if (trigger === "update" && session) {
        if (session.role        !== undefined) token.role        = session.role;
        if (session.accountType !== undefined) token.accountType = session.accountType;
        token.roles = session.role ? [session.role as string] : [];
        return token;
      }

      if (account && profile) {
        // Fetch extra GitHub data (public_repos, created_at) for trust scoring
        let githubExtra: { public_repos: number; created_at: string } | undefined;
        if (account.provider === "github" && account.access_token) {
          try {
            const ghRes = await fetch("https://api.github.com/user", {
              headers: {
                Authorization: `Bearer ${account.access_token}`,
                "User-Agent": "AiStaffApp",
              },
            });
            if (ghRes.ok) githubExtra = await ghRes.json();
          } catch {
            // Non-fatal — trust score will use minimal GitHub data
          }
        }

        const result = await callIdentityOAuthCallback(
          account,
          profile,
          githubExtra
        );

        token.profileId    = result.profile_id;
        token.identityTier = result.identity_tier;
        token.trustScore   = result.trust_score;
        token.provider     = account.provider;
        token.accountType  = result.account_type;
        token.role         = result.role ?? null;
        token.roles        = result.role ? [result.role] : [];
      }
      return token;
    },

    async session({ session, token }) {
      session.user.profileId    = token.profileId    as string;
      session.user.identityTier = (token.identityTier as "UNVERIFIED" | "SOCIAL_VERIFIED" | "BIOMETRIC_VERIFIED") ?? "UNVERIFIED";
      session.user.trustScore   = token.trustScore   as number;
      session.user.provider     = token.provider     as string;
      session.user.accountType  = (token.accountType as string) ?? "individual";
      session.user.role         = (token.role        as string | null) ?? null;
      session.user.roles        = (token.roles       as string[]) ?? [];
      return session;
    },
  },

  pages: { signIn: "/login" },
});
