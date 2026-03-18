export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Lightweight liveness probe for Dokploy / load-balancer health checks.
 * Point Dokploy's health check URL here instead of any auth endpoint.
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
