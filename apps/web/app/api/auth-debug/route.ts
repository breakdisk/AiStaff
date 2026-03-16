// Temporary diagnostic endpoint — DELETE before production launch
// Shows which auth-related env vars are present (values redacted)
import { NextResponse } from "next/server";

export async function GET() {
  const check = (name: string) => {
    const val = process.env[name];
    if (!val) return "❌ MISSING";
    if (val.length < 5) return `⚠️ TOO SHORT (${val.length} chars)`;
    return `✅ SET (${val.length} chars, starts: ${val.substring(0, 4)}…)`;
  };

  return NextResponse.json({
    node_env: process.env.NODE_ENV ?? "undefined",
    auth: {
      AUTH_SECRET: check("AUTH_SECRET"),
      NEXTAUTH_SECRET: check("NEXTAUTH_SECRET"),
      AUTH_URL: process.env.AUTH_URL ?? "❌ MISSING",
      NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "❌ MISSING",
    },
    providers: {
      GITHUB_CLIENT_ID: check("GITHUB_CLIENT_ID"),
      GITHUB_CLIENT_SECRET: check("GITHUB_CLIENT_SECRET"),
      GOOGLE_CLIENT_ID: check("GOOGLE_CLIENT_ID"),
      GOOGLE_CLIENT_SECRET: check("GOOGLE_CLIENT_SECRET"),
      LINKEDIN_CLIENT_ID: check("LINKEDIN_CLIENT_ID"),
      LINKEDIN_CLIENT_SECRET: check("LINKEDIN_CLIENT_SECRET"),
    },
    timestamp: new Date().toISOString(),
  });
}
