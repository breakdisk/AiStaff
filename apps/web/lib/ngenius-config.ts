/**
 * N-Genius API configuration.
 *
 * Set NGENIUS_ENV=production in Dokploy/env to switch to live payments.
 * NETWORK_INTL_API_BASE is accepted as an explicit override (kept for
 * compatibility) but NGENIUS_ENV is the preferred toggle — it can never
 * result in an http:// URL or an Akamai 403.
 */

const PRODUCTION_URL = "https://api-gateway.ngenius-payments.com";
const SANDBOX_URL    = "https://api-gateway.sandbox.ngenius-payments.com";

function resolveApiBase(): string {
  // 1. Explicit environment flag (preferred)
  const env = (process.env.NGENIUS_ENV ?? "").toLowerCase().trim();
  if (env === "production" || env === "prod") return PRODUCTION_URL;
  if (env === "sandbox")                      return SANDBOX_URL;

  // 2. Legacy full-URL override — always enforce HTTPS regardless of what was typed
  const raw = (process.env.NETWORK_INTL_API_BASE ?? "").trim();
  if (raw) {
    const safe = raw.replace(/^https?:\/\//i, "https://");
    console.log(`[ngenius-config] API_BASE from env: ${safe}`);
    return safe;
  }

  // 3. Derive from NODE_ENV (production container → production gateway)
  if (process.env.NODE_ENV === "production") {
    console.log("[ngenius-config] NODE_ENV=production → using production gateway");
    return PRODUCTION_URL;
  }

  console.log("[ngenius-config] defaulting to sandbox gateway");
  return SANDBOX_URL;
}

export const NGENIUS_API_BASE = resolveApiBase();

console.log(`[ngenius-config] resolved API base: ${NGENIUS_API_BASE}`);
