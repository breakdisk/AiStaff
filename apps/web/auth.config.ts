/**
 * auth.config.ts — Edge-safe NextAuth configuration.
 *
 * This file is imported by both:
 *   - middleware.ts  (Edge runtime — NO Node.js modules allowed)
 *   - auth.ts        (Node.js runtime — extends this with adapter + Nodemailer)
 *
 * Rules: NO imports of `pg`, `nodemailer`, or any Node.js built-in module.
 * All I/O uses `fetch` which is available in both runtimes.
 */

import GitHub         from "next-auth/providers/github";
import Google         from "next-auth/providers/google";
import LinkedIn       from "next-auth/providers/linkedin";
import Facebook       from "next-auth/providers/facebook";
import MicrosoftEntraId from "next-auth/providers/microsoft-entra-id";
import type { Account, Profile, NextAuthConfig } from "next-auth";

// ── identity_service base URL ─────────────────────────────────────────────────

const IDENTITY_URL =
  process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

// ── Payload / response types for identity_service oauth-callback ──────────────

interface OAuthCallbackPayload {
  provider: "github" | "google" | "linkedin" | "facebook" | "microsoft-entra-id" | "nodemailer";
  provider_uid: string;
  email: string;
  display_name: string;
  github_repos?: number;
  github_created_at?: string;
  github_followers?: number;
  github_stars?: number;
  email_verified?: boolean;
  existing_profile_id?: string;
}

interface OAuthCallbackResponse {
  profile_id:        string;
  identity_tier:     "UNVERIFIED" | "SOCIAL_VERIFIED" | "BIOMETRIC_VERIFIED";
  trust_score:       number;
  account_type:      string;
  role:              string | null;
  is_admin:          boolean;
  is_linked_account: boolean;
}

async function callIdentityOAuthCallback(
  account: Account,
  profile: Profile,
  githubExtra?: { public_repos: number; created_at: string; followers: number }
): Promise<OAuthCallbackResponse> {
  const payload: OAuthCallbackPayload = {
    provider: account.provider as OAuthCallbackPayload["provider"],
    provider_uid: String(account.providerAccountId),
    email: (profile as { email?: string }).email ?? "",
    display_name: (profile as { name?: string }).name ?? "",
    // Normalise to boolean — LinkedIn sends email_verified as the string "true"
    // which Rust's serde rejects with 422 (expected bool, got string).
    email_verified: (() => {
      const raw = (profile as { email_verified?: unknown }).email_verified;
      if (raw === true  || raw === "true")  return true;
      if (raw === false || raw === "false") return false;
      return undefined;
    })(),
    github_repos:     githubExtra?.public_repos,
    github_created_at: githubExtra?.created_at,
    github_followers: githubExtra?.followers,
    github_stars:     githubExtra?.public_repos,
  };

  try {
    const res = await fetch(`${IDENTITY_URL}/identity/oauth-callback`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    if (res.ok) return res.json() as Promise<OAuthCallbackResponse>;
    const msg = await res.text().catch(() => "unknown");
    console.warn(`[auth] identity_service ${res.status}: ${msg}`);
  } catch (err) {
    console.warn("[auth] identity_service unreachable:", err);
  }

  // Fallback: return Unverified tier so login still succeeds
  return {
    profile_id:        account.providerAccountId,
    identity_tier:     "UNVERIFIED",
    trust_score:       0,
    account_type:      "individual",
    role:              null,
    is_admin:          false,
    is_linked_account: false,
  };
}

// ── Cookie config ─────────────────────────────────────────────────────────────

const isProduction = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "")
  .startsWith("https://");

// ── Edge-safe NextAuth config ─────────────────────────────────────────────────

export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: { strategy: "jwt" },

  cookies: isProduction
    ? {
        sessionToken: {
          name: "authjs.session-token",
          options: { httpOnly: true, sameSite: "lax", path: "/", secure: true },
        },
        callbackUrl: {
          name: "authjs.callback-url",
          options: { httpOnly: true, sameSite: "lax", path: "/", secure: true },
        },
        csrfToken: {
          name: "authjs.csrf-token",
          options: { httpOnly: true, sameSite: "lax", path: "/", secure: true },
        },
        state: {
          name: "authjs.state",
          options: { httpOnly: true, sameSite: "none", path: "/", secure: true, maxAge: 60 * 15 },
        },
        nonce: {
          name: "authjs.nonce",
          options: { httpOnly: true, sameSite: "none", path: "/", secure: true, maxAge: 60 * 15 },
        },
      }
    : undefined,

  providers: [
    LinkedIn({
      clientId:     process.env.LINKEDIN_CLIENT_ID!,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
      checks: ["state"],
    }),
    Google({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      checks: ["state"],
    }),
    Facebook({
      clientId:     process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
      checks: ["state"],
    }),
    GitHub({
      clientId:     process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      checks: ["state"],
    }),
    // Only register when credentials are present — passing an empty clientId
    // causes Azure to return AADSTS900144 ("client_id is required").
    ...(process.env.AZURE_AD_CLIENT_ID
      ? [MicrosoftEntraId({
          clientId:     process.env.AZURE_AD_CLIENT_ID,
          clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? "",
          ...(process.env.AZURE_AD_TENANT_ID
            ? { issuer: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0` }
            : {}),
        })]
      : []),
    // Nodemailer is added in auth.ts (Node.js only — uses stream module)
  ],

  callbacks: {
    async jwt({ token, account, profile, trigger, session, user }) {
      if (trigger === "update" && session) {
        if (session.role        !== undefined) token.role        = session.role;
        if (session.accountType !== undefined) token.accountType = session.accountType;
        token.roles = session.role ? [session.role as string] : [];
        return token;
      }

      // Magic link (email/nodemailer provider)
      if (account?.type === "email") {
        const emailAddr = user?.email ?? String(account.providerAccountId);
        try {
          const res = await fetch(`${IDENTITY_URL}/identity/oauth-callback`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider:     "nodemailer",
              provider_uid: emailAddr,
              email:        emailAddr,
              display_name: emailAddr.split("@")[0],
            }),
          });
          if (res.ok) {
            const result = await res.json() as OAuthCallbackResponse;
            token.profileId       = result.profile_id;
            token.identityTier    = result.identity_tier;
            token.trustScore      = result.trust_score;
            token.provider        = "email";
            token.accountType     = result.account_type;
            token.role            = result.role ?? null;
            token.roles           = result.role ? [result.role] : [];
            token.isAdmin         = result.is_admin ?? false;
            token.isLinkedAccount = result.is_linked_account ?? false;
          }
        } catch (err) {
          console.warn("[auth] identity_service unreachable (magic link):", err);
        }
        return token;
      }

      // Standard OAuth providers
      if (account && profile) {
        let githubExtra: { public_repos: number; created_at: string; followers: number } | undefined;
        if (account.provider === "github" && account.access_token) {
          try {
            const ghRes = await fetch("https://api.github.com/user", {
              headers: { Authorization: `Bearer ${account.access_token}`, "User-Agent": "AiStaffApp" },
            });
            if (ghRes.ok) githubExtra = await ghRes.json();
          } catch { /* non-fatal */ }
        }

        const result = await callIdentityOAuthCallback(account, profile, githubExtra);
        token.profileId       = result.profile_id;
        token.identityTier    = result.identity_tier;
        token.trustScore      = result.trust_score;
        token.provider        = account.provider;
        token.accountType     = result.account_type;
        token.role            = result.role ?? null;
        token.roles           = result.role ? [result.role] : [];
        token.isAdmin         = result.is_admin ?? false;
        token.isLinkedAccount = result.is_linked_account ?? false;

        if (account.provider === "github" && account.access_token) {
          token.githubAccessToken = account.access_token;
        }
      }
      return token;
    },

    async session({ session, token }) {
      session.user.profileId         = token.profileId    as string;
      session.user.identityTier      = (token.identityTier as "UNVERIFIED" | "SOCIAL_VERIFIED" | "BIOMETRIC_VERIFIED") ?? "UNVERIFIED";
      session.user.trustScore        = token.trustScore   as number;
      session.user.provider          = token.provider     as string;
      session.user.accountType       = (token.accountType as string) ?? "individual";
      session.user.role              = (token.role        as string | null) ?? null;
      session.user.roles             = (token.roles       as string[]) ?? [];
      session.user.isAdmin           = (token.isAdmin          as boolean) ?? false;
      session.user.isLinkedAccount   = (token.isLinkedAccount  as boolean) ?? false;
      session.user.githubAccessToken = (token.githubAccessToken as string | undefined) ?? undefined;
      return session;
    },
  },

  pages: { signIn: "/login", verifyRequest: "/auth/verify-request" },
};
