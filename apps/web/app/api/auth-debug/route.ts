// Temporary diagnostic endpoint — DELETE before production launch
import { NextResponse } from "next/server";
import { headers } from "next/headers";

export async function GET(req: Request) {
  const check = (name: string) => {
    const val = process.env[name];
    if (!val) return "❌ MISSING";
    if (val.length < 5) return `⚠️ TOO SHORT (${val.length} chars)`;
    return `✅ SET (${val.length} chars, starts: ${val.substring(0, 4)}…)`;
  };

  // Capture what the origin server actually sees from Cloudflare
  const hdrs = await headers();
  const requestUrl = req.url;

  return NextResponse.json({
    node_env: process.env.NODE_ENV ?? "undefined",
    request: {
      url: requestUrl,
      protocol_from_url: new URL(requestUrl).protocol,
      x_forwarded_proto: hdrs.get("x-forwarded-proto") ?? "NOT SET",
      x_forwarded_host: hdrs.get("x-forwarded-host") ?? "NOT SET",
      host: hdrs.get("host") ?? "NOT SET",
      cf_visitor: hdrs.get("cf-visitor") ?? "NOT SET",
      cf_connecting_ip: hdrs.get("cf-connecting-ip") ? "present" : "NOT SET",
      cf_ray: hdrs.get("cf-ray") ?? "NOT SET",
    },
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
