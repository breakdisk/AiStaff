export const runtime = "nodejs";
/**
 * GET /api/network-intl/diag
 * Returns the outbound IP + resolved N-Genius API base.
 * REMOVE BEFORE PUBLIC LAUNCH.
 */
import { NextResponse } from "next/server";
import { NGENIUS_API_BASE } from "@/lib/ngenius-config";

export async function GET() {
  // Ask an external service what IP this server appears as
  let outboundIp = "unknown";
  try {
    const r = await fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(5_000),
    });
    const j = await r.json() as { ip: string };
    outboundIp = j.ip;
  } catch { /* ignore */ }

  // Try to reach N-Genius identity endpoint and capture the raw HTTP status
  let ngeniusReach = "not tested";
  try {
    const r = await fetch(`${NGENIUS_API_BASE}/identity/auth/access-token`, {
      method:  "POST",
      headers: { "Content-Type": "application/vnd.ni-identity.v1+json" },
      signal:  AbortSignal.timeout(8_000),
    });
    ngeniusReach = `HTTP ${r.status}`;
  } catch (e) {
    ngeniusReach = `fetch error: ${e instanceof Error ? e.message : String(e)}`;
  }

  return NextResponse.json({
    outbound_ip:     outboundIp,
    ngenius_api_base: NGENIUS_API_BASE,
    ngenius_reach:   ngeniusReach,
    node_env:        process.env.NODE_ENV,
    ngenius_env_var: process.env.NGENIUS_ENV ?? "(not set)",
    api_base_env:    process.env.NETWORK_INTL_API_BASE ?? "(not set)",
  });
}
