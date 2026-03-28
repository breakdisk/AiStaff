/**
 * GET /api/diag/smtp
 * Shows which SMTP-related env vars process.env can see at runtime.
 * Returns presence flags only — never actual values.
 * DELETE THIS FILE after debugging is complete.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Scan all env keys that contain smtp/mail/ses/pass/user (case-insensitive)
  const relevant = Object.entries(process.env)
    .filter(([k]) => /smtp|mail|ses/i.test(k))
    .map(([k, v]) => ({ key: k, set: !!v, length: v?.length ?? 0 }));

  return NextResponse.json({
    smtpHost:     process.env.SMTP_HOST     ?? "(not set)",
    smtpPort:     process.env.SMTP_PORT     ?? "(not set)",
    smtpFrom:     process.env.SMTP_FROM     ?? "(not set)",
    smtpUserSet:  !!process.env.SMTP_USER,
    smtpPassSet:  !!process.env.SMTP_PASS,
    smtpUsername: !!process.env.SMTP_USERNAME,
    smtpPassword: !!process.env.SMTP_PASSWORD,
    allSmtpKeys: relevant,
  });
}
