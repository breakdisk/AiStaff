export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/network-intl/test
 * Diagnostic endpoint — tries all auth formats against N-Genius and returns
 * the raw results. Remove or gate this behind admin auth before public launch.
 */

import { NextResponse } from "next/server";

const API_BASE   = process.env.NETWORK_INTL_API_BASE   ?? "https://api-gateway.sandbox.ngenius-payments.com";
const API_KEY    = process.env.NETWORK_INTL_API_KEY    ?? "";
const OUTLET_REF = process.env.NETWORK_INTL_OUTLET_REF ?? "";

async function tryAuth(label: string, authHeader: string, body?: string) {
  try {
    const res = await fetch(`${API_BASE}/identity/auth/access-token`, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type":  "application/vnd.ni-identity.v1+json",
      },
      body: body ?? undefined,
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* leave as string */ }
    return { label, status: res.status, ok: res.ok, response: parsed };
  } catch (err) {
    return { label, status: 0, ok: false, error: String(err) };
  }
}

export async function GET() {
  const keyMasked = API_KEY
    ? `${API_KEY.slice(0, 6)}…${API_KEY.slice(-4)} (length: ${API_KEY.length})`
    : "(empty — NETWORK_INTL_API_KEY not set)";

  const results = await Promise.all([
    // Format A: key used AS-IS (portal already gives pre-encoded base64 credentials)
    tryAuth(
      "A: Basic <key-as-is> (no re-encoding)",
      `Basic ${API_KEY}`,
    ),
    // Format B: base64(apiKey) — single encode (previous attempt)
    tryAuth(
      "B: Basic base64(apiKey)",
      `Basic ${Buffer.from(API_KEY).toString("base64")}`,
    ),
    // Format C: base64(apiKey:) — trailing colon
    tryAuth(
      "C: Basic base64(apiKey:)",
      `Basic ${Buffer.from(`${API_KEY}:`).toString("base64")}`,
    ),
    // Format D: key as-is + empty body
    tryAuth(
      "D: Basic <key-as-is> + body {}",
      `Basic ${API_KEY}`,
      "{}",
    ),
    // Format E: try decoding the key first — if it's base64(user:pass), decode then re-use
    tryAuth(
      "E: decoded key as plain Basic",
      (() => {
        try {
          const decoded = Buffer.from(API_KEY, "base64").toString("utf8");
          // If it decodes to user:pass format, re-encode it properly
          return `Basic ${Buffer.from(decoded).toString("base64")}`;
        } catch {
          return `Basic ${API_KEY}`;
        }
      })(),
    ),
  ]);

  return NextResponse.json({
    config: {
      API_BASE,
      API_KEY: keyMasked,
      OUTLET_REF: OUTLET_REF || "(empty — NETWORK_INTL_OUTLET_REF not set)",
      key_looks_like_base64: API_KEY.endsWith("=") || API_KEY.endsWith("=="),
      key_decoded_preview: (() => {
        try {
          const d = Buffer.from(API_KEY, "base64").toString("utf8");
          return d.length > 10 ? `${d.slice(0, 8)}… (${d.length} chars decoded)` : d;
        } catch { return "not valid base64"; }
      })(),
    },
    auth_attempts: results,
    instructions: "Look for the format where status=200 and ok=true.",
  });
}
