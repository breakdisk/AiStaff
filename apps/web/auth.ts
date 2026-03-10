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
  profile_id: string;
  identity_tier: "UNVERIFIED" | "SOCIAL_VERIFIED" | "BIOMETRIC_VERIFIED";
  trust_score: number;
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
    email_verified: (profile as { email_verified?: boolean }).email_verified,
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
    profile_id: account.providerAccountId,
    identity_tier: "UNVERIFIED",
    trust_score: 0,
  };
}

// ── NextAuth config ───────────────────────────────────────────────────────────

export const { handlers, signIn, signOut, auth } = NextAuth({
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

  callbacks: {
    async jwt({ token, account, profile }) {
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
        token.roles        = ["talent"]; // default; updated on profile page
      }
      return token;
    },

    async session({ session, token }) {
      session.user.profileId    = token.profileId    as string;
      session.user.identityTier = (token.identityTier as "UNVERIFIED" | "SOCIAL_VERIFIED" | "BIOMETRIC_VERIFIED") ?? "UNVERIFIED";
      session.user.trustScore   = token.trustScore   as number;
      session.user.provider     = token.provider     as string;
      session.user.roles        = (token.roles       as string[]) ?? ["talent"];
      return session;
    },
  },

  pages: { signIn: "/login" },
});
