"use server";

/**
 * Magic link Server Action.
 *
 * Generates a short-lived HMAC-signed JWT (jose, HS256, 10 min) containing
 * the user's email, then sends it via Amazon SES SMTP. No Auth.js adapter,
 * no verification_tokens table — the token is stateless and self-validating.
 *
 * On click the link lands at /magic-verify which calls signIn("magic", {email, token})
 * → Credentials("magic").authorize() verifies the JWT → session created.
 */

import { SignJWT } from "jose";

function magicKey(): Uint8Array {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "",
  );
}

export async function sendMagicLink(
  email: string,
  callbackUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Invalid email address." };
  }

  try {
    // ── Sign a 10-minute token ─────────────────────────────────────────────
    const token = await new SignJWT({ email })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(magicKey());

    // ── Build the verify URL ───────────────────────────────────────────────
    const base = (
      process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000"
    ).replace(/\/$/, "");
    const verifyUrl =
      `${base}/magic-verify` +
      `?email=${encodeURIComponent(email)}` +
      `&token=${encodeURIComponent(token)}` +
      `&next=${encodeURIComponent(callbackUrl || "/dashboard")}`;

    // ── Send via Amazon SES SMTP ───────────────────────────────────────────
    // Dynamic import keeps nodemailer out of the Edge runtime bundle.
    const nodemailer = await import("nodemailer");
    const transport  = nodemailer.createTransport({
      host:   process.env.SMTP_HOST   ?? "localhost",
      port:   Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth:   process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });

    await transport.sendMail({
      to:      email,
      from:    process.env.SMTP_FROM ?? "noreply@aistaffglobal.com",
      subject: "Sign in to AiStaff",
      html: `
<div style="background:#09090b;color:#fafafa;font-family:ui-sans-serif,system-ui,sans-serif;
            padding:40px;max-width:480px;margin:0 auto;border-radius:4px;">
  <h1 style="font-size:18px;font-weight:600;margin:0 0 8px;">Sign in to AiStaff</h1>
  <p style="color:#a1a1aa;font-size:13px;margin:0 0 24px;">
    Click the button below to sign in. This link expires in 10 minutes.
  </p>
  <a href="${verifyUrl}"
     style="display:inline-block;background:#fbbf24;color:#09090b;font-weight:600;
            font-size:13px;padding:10px 20px;border-radius:2px;text-decoration:none;">
    Sign in to AiStaff
  </a>
  <p style="color:#52525b;font-size:11px;margin:24px 0 0;">
    If you did not request this email, you can safely ignore it.
  </p>
</div>`,
    });

    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[magic-link] sendMagicLink error:", msg);
    // Return the real error so it surfaces in the UI during debugging.
    // In production this is only visible in Dokploy web service logs.
    return { ok: false, error: msg };
  }
}
