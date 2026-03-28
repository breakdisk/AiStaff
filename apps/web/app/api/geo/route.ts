/**
 * GET /api/geo
 *
 * Returns the requesting client's ISO 3166-1 alpha-2 country code.
 * Used by PaymentModal to auto-select the appropriate payment gateway:
 *   AE (UAE) → N-Genius (AED)
 *   All others → Stripe (USD)
 *
 * Detection priority:
 *   1. CF-IPCountry header (Cloudflare — zero cost, if ever re-enabled)
 *   2. X-Forwarded-For / X-Real-IP (Traefik) → ipapi.co lookup
 *   3. Default "AE" for private/local IPs (dev) and lookup failures
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Module-level in-memory cache — avoids calling ipapi.co on every modal open
const cache = new Map<string, { country: string; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes

function isPrivateIp(ip: string): boolean {
  return (
    !ip ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

async function resolveCountry(ip: string): Promise<string> {
  if (isPrivateIp(ip)) return "AE"; // local dev → default UAE

  const hit = cache.get(ip);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.country;

  try {
    const res = await fetch(`https://ipapi.co/${ip}/country/`, {
      headers: { "User-Agent": "AiStaffApp/1.0" },
      signal: AbortSignal.timeout(2_000),
    });
    if (res.ok) {
      const country = (await res.text()).trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(country)) {
        cache.set(ip, { country, ts: Date.now() });
        return country;
      }
    }
  } catch {
    /* geo lookup failed — fall through to default */
  }

  return "AE"; // default AE: UAE-first platform, N-Genius outlet is AED
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // 1. Cloudflare header (fastest — no external call needed)
  const cfCountry = req.headers.get("cf-ipcountry");
  if (cfCountry) {
    return NextResponse.json({ country: cfCountry.toUpperCase() });
  }

  // 2. Traefik passes real client IP via X-Forwarded-For or X-Real-IP
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp    = req.headers.get("x-real-ip");
  const ip        = (forwarded?.split(",")[0] ?? realIp ?? "").trim();

  const country = await resolveCountry(ip);
  return NextResponse.json({ country });
}
