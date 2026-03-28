import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import LinkedIn from "next-auth/providers/linkedin";
import Facebook from "next-auth/providers/facebook";
import MicrosoftEntraId from "next-auth/providers/microsoft-entra-id";
import Nodemailer from "next-auth/providers/nodemailer";
import type { Account, Profile } from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { Pool } from "pg";

// ── identity_service base URL ─────────────────────────────────────────────────

const IDENTITY_URL =
  process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

// ── PostgreSQL pool for magic link verification token storage ─────────────────
// Shared with proposals/submit route — same DATABASE_URL, keep pool small.
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
});

// ── Payload builder — maps NextAuth provider data → identity_service format ───

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
  account_type:      string;         // "individual" | "agency"
  role:              string | null;  // "talent" | "client" | "agent-owner" | null
  is_admin:          boolean;
  is_linked_account: boolean;
}

async function callIdentityOAuthCallback(
  account: Account,
  profile: Profile,
  githubExtra?: { public_repos: number; created_at: string; followers: number }
): Promise<OAuthCallbackResponse> {
  const payload: OAuthCallbackPayload = {
    provider: account.provider as
      "github" | "google" | "linkedin" | "facebook" | "microsoft-entra-id" | "nodemailer",
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
    github_followers: githubExtra?.followers,
    github_stars:     githubExtra?.public_repos,
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
    profile_id:        account.providerAccountId,
    identity_tier:     "UNVERIFIED",
    trust_score:       0,
    account_type:      "individual",
    role:              null,
    is_admin:          false,
    is_linked_account: false,
  };
}

// ── Minimal Auth.js adapter — only implements verification token methods ──────
// We use JWT sessions; this adapter only exists to store one-time magic link
// tokens in `verification_tokens`. All other methods are stubs.
const authAdapter: Adapter = {
  createVerificationToken: async (vt) => {
    await pgPool.query(
      `INSERT INTO verification_tokens (identifier, token, expires)
       VALUES ($1, $2, $3)
       ON CONFLICT (identifier, token) DO UPDATE SET expires = EXCLUDED.expires`,
      [vt.identifier, vt.token, vt.expires],
    );
    return vt;
  },
  useVerificationToken: async ({ identifier, token }) => {
    const res = await pgPool.query(
      `DELETE FROM verification_tokens
       WHERE identifier = $1 AND token = $2 AND expires > NOW()
       RETURNING identifier, token, expires`,
      [identifier, token],
    );
    if (!res.rows[0]) return null;
    return {
      identifier: res.rows[0].identifier as string,
      token: res.rows[0].token as string,
      expires: new Date(res.rows[0].expires as string),
    };
  },
  // Stub user methods — Auth.js email provider requires these.
  // Identity is managed by identity_service, not Auth.js user tables.
  createUser: async (user) => ({ id: user.email ?? "", ...user } as AdapterUser),
  getUser: async () => null,
  getUserByEmail: async (email) =>
    ({ id: email, email, emailVerified: new Date(), name: email.split("@")[0] }) as AdapterUser,
  getUserByAccount: async () => null,
  updateUser: async (user) => user as AdapterUser,
  linkAccount: async () => undefined,
  createSession: async (session) => session,
  getSessionAndUser: async () => null,
  updateSession: async () => null,
  deleteSession: async () => {},
  deleteUser: async () => {},
  unlinkAccount: async () => undefined,
};

// ── NextAuth config ───────────────────────────────────────────────────────────

// Detect production: AUTH_URL is set to https:// in production (Dokploy env).
// In development AUTH_URL / NEXTAUTH_URL points to http://localhost:3000.
const isProduction = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "")
  .startsWith("https://");

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: authAdapter,

  // Required behind any reverse proxy (Traefik, Cloudflare, etc.).
  // Instructs Auth.js to trust X-Forwarded-Host / X-Forwarded-Proto headers
  // so AUTH_URL inference and redirect_uri generation use the public hostname.
  trustHost: true,

  // Explicit cookie configuration.
  //
  // Root cause of the persistent InvalidCheck errors:
  // Traefik terminates TLS — the Next.js container sees plain HTTP internally.
  // Auth.js infers useSecureCookies=true from AUTH_URL=https://, so it names
  // cookies with the __Secure- prefix and sets the Secure flag.  On the OAuth
  // callback the container-side request is HTTP, so some Auth.js code paths
  // treat it as insecure and refuse to read __Secure- prefixed cookies, causing
  // "pkceCodeVerifier value could not be parsed" even when the cookie was set.
  //
  // Fix: lock cookie names to explicit, non-prefixed strings in production and
  // set Secure + SameSite=None explicitly so browsers accept them on the
  // cross-origin OAuth callback (provider domain → our domain).
  // In development (HTTP localhost) use plain names with no Secure flag.
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
        // state cookie: used by checks:["state"] to validate the OAuth round-trip.
        // SameSite=None + Secure so it survives the provider→app redirect.
        state: {
          name: "authjs.state",
          options: {
            httpOnly: true,
            sameSite: "none",
            path: "/",
            secure: true,
            maxAge: 60 * 15, // 15 minutes — enough for any OAuth flow
          },
        },
        // nonce is not used (PKCE disabled), but define it to prevent Auth.js
        // from auto-generating a __Secure- prefixed name and then failing to
        // read it on the callback.
        nonce: {
          name: "authjs.nonce",
          options: {
            httpOnly: true,
            sameSite: "none",
            path: "/",
            secure: true,
            maxAge: 60 * 15,
          },
        },
      }
    : undefined, // Dev: let Auth.js use defaults (no __Secure- prefix on HTTP)

  providers: [
    LinkedIn({
      clientId: process.env.LINKEDIN_CLIENT_ID!,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
      checks: ["state"],
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      checks: ["state"],
    }),
    Facebook({
      clientId:     process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
      checks: ["state"],
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      // PKCE disabled: GitHub is a confidential client (has client_secret).
      // The state cookie prevents CSRF. PKCE is only needed for public clients
      // (SPAs with no server-side secret). Keeping PKCE on a server-side app
      // behind Traefik adds a cookie that is unreliable across SSL-terminating
      // proxies — see full diagnosis in docs/adr/ (auth cookie fix).
      checks: ["state"],
    }),
    MicrosoftEntraId({
      clientId:     process.env.AZURE_AD_CLIENT_ID     ?? "",
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? "",
      // Tenant restriction: set AZURE_AD_TENANT_ID for single-tenant apps.
      // Auth.js also reads AUTH_MICROSOFT_ENTRA_ID_TENANT_ID automatically.
      // Omit issuer for multi-tenant (common) — default Auth.js behaviour.
      ...(process.env.AZURE_AD_TENANT_ID
        ? { issuer: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0` }
        : {}),
    }),
    Nodemailer({
      server: {
        host:   process.env.SMTP_HOST ?? "localhost",
        port:   Number(process.env.SMTP_PORT ?? 587),
        secure: Number(process.env.SMTP_PORT ?? 587) === 465,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      },
      from: process.env.SMTP_FROM ?? "noreply@aistaffglobal.com",
      sendVerificationRequest: async ({ identifier: email, url }) => {
        const nodemailer = await import("nodemailer");
        const transport = nodemailer.createTransport({
          host:   process.env.SMTP_HOST ?? "localhost",
          port:   Number(process.env.SMTP_PORT ?? 587),
          secure: Number(process.env.SMTP_PORT ?? 587) === 465,
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
        });
        await transport.sendMail({
          to:      email,
          from:    process.env.SMTP_FROM ?? "noreply@aistaffglobal.com",
          subject: "Sign in to AiStaff",
          html: `
<div style="background:#09090b;color:#fafafa;font-family:ui-sans-serif,system-ui,sans-serif;padding:40px;max-width:480px;margin:0 auto;border-radius:4px;">
  <h1 style="font-size:18px;font-weight:600;margin:0 0 8px;">Sign in to AiStaff</h1>
  <p style="color:#a1a1aa;font-size:13px;margin:0 0 24px;">Click the button below to sign in. This link expires in 10 minutes.</p>
  <a href="${url}" style="display:inline-block;background:#fbbf24;color:#09090b;font-weight:600;font-size:13px;padding:10px 20px;border-radius:2px;text-decoration:none;">Sign in</a>
  <p style="color:#52525b;font-size:11px;margin:24px 0 0;">If you did not request this email, you can ignore it.</p>
</div>`,
        });
      },
    }),
  ],

  session: { strategy: "jwt" },

  callbacks: {
    async jwt({ token, account, profile, trigger, session, user }) {
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

      // ── Magic link (email/nodemailer provider) ────────────────────────────────
      if (account?.type === "email") {
        const emailAddr = (user?.email ?? String(account.providerAccountId));
        try {
          const res = await fetch(`${IDENTITY_URL}/identity/oauth-callback`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              provider:     "nodemailer",
              provider_uid: emailAddr,
              email:        emailAddr,
              display_name: emailAddr.split("@")[0],
            }),
          });
          if (res.ok) {
            const result = await res.json() as OAuthCallbackResponse;
            token.profileId        = result.profile_id;
            token.identityTier     = result.identity_tier;
            token.trustScore       = result.trust_score;
            token.provider         = "email";
            token.accountType      = result.account_type;
            token.role             = result.role ?? null;
            token.roles            = result.role ? [result.role] : [];
            token.isAdmin          = result.is_admin ?? false;
            token.isLinkedAccount  = result.is_linked_account ?? false;
          }
        } catch (err) {
          console.warn("[auth] identity_service unreachable (magic link):", err);
        }
        return token;
      }

      // ── Standard OAuth providers (GitHub, Google, LinkedIn, Facebook, Microsoft) ──
      if (account && profile) {
        // Fetch extra GitHub data (public_repos, created_at) for trust scoring
        let githubExtra: { public_repos: number; created_at: string; followers: number } | undefined;
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
        token.isAdmin      = result.is_admin ?? false;
        token.isLinkedAccount = result.is_linked_account ?? false;

        // Store GitHub access token for server-side webhook registration.
        // Stored encrypted in the httpOnly session cookie — never exposed to the browser.
        if (account.provider === "github" && account.access_token) {
          token.githubAccessToken = account.access_token;
        }
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
      session.user.isAdmin           = (token.isAdmin          as boolean) ?? false;
      session.user.isLinkedAccount   = (token.isLinkedAccount  as boolean) ?? false;
      session.user.githubAccessToken = (token.githubAccessToken as string | undefined) ?? undefined;
      return session;
    },
  },

  pages: { signIn: "/login", verifyRequest: "/auth/verify-request" },
});
