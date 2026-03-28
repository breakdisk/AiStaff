/**
 * auth.ts — Full NextAuth instance (Node.js runtime only).
 *
 * Extends auth.config.ts with:
 *   - Nodemailer provider (email magic link) — requires Node.js `stream` module
 *   - pg adapter for verification_tokens table
 *
 * DO NOT import this file from middleware.ts — use auth.config.ts there.
 */

import NextAuth    from "next-auth";
import Nodemailer  from "next-auth/providers/nodemailer";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { Pool }    from "pg";
import { authConfig } from "@/auth.config";

// ── PostgreSQL pool for magic link verification token storage ─────────────────
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
});

// ── Minimal adapter — verification tokens only ────────────────────────────────
// JWT sessions are used; this adapter exists solely to store/use one-time
// magic link tokens. All other methods are stubs.
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
      token:      res.rows[0].token      as string,
      expires:    new Date(res.rows[0].expires as string),
    };
  },
  createUser:        async (user)    => ({ id: user.email ?? "", ...user } as AdapterUser),
  getUser:           async ()        => null,
  getUserByEmail:    async (email)   =>
    ({ id: email, email, emailVerified: new Date(), name: email.split("@")[0] }) as AdapterUser,
  getUserByAccount:  async ()        => null,
  updateUser:        async (user)    => user as AdapterUser,
  linkAccount:       async ()        => undefined,
  createSession:     async (session) => session,
  getSessionAndUser: async ()        => null,
  updateSession:     async ()        => null,
  deleteSession:     async ()        => {},
  deleteUser:        async ()        => {},
  unlinkAccount:     async ()        => undefined,
};

// ── Full NextAuth instance ────────────────────────────────────────────────────
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: authAdapter,
  providers: [
    ...(authConfig.providers ?? []),
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
        const transport  = nodemailer.createTransport({
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
});
