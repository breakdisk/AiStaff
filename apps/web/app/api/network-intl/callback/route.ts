export const runtime = "nodejs";

/**
 * GET /api/network-intl/callback?listing_id=…&client_id=…&order_ref=…&ref=…
 *
 * N-Genius redirects the user's browser here after payment completes.
 * - `ref`       = N-Genius canonical order reference (appended by N-Genius)
 * - `order_ref` = merchantOrderReference we set (for correlation)
 * - `listing_id`, `client_id` — carried from our original redirectUrl
 *
 * Flow:
 *  1. Verify payment status with N-Genius API
 *  2. If CAPTURED/AUTHORISED: fetch listing, create deployment
 *  3. Redirect user to /dashboard (success) or /marketplace (failure)
 *
 * Docs: https://docs.ngenius-payments.com/reference/request-payment-from-your-customer-paypage
 */

import { NextRequest, NextResponse } from "next/server";
import { v7 as uuidv7 } from "uuid";

const API_BASE        = process.env.NETWORK_INTL_API_BASE        ?? "https://api-gateway.sandbox.ngenius-payments.com";
const API_KEY         = process.env.NETWORK_INTL_API_KEY         ?? "";
const OUTLET_REF      = process.env.NETWORK_INTL_OUTLET_REF      ?? "";
const MARKETPLACE_URL = process.env.MARKETPLACE_SERVICE_URL      ?? "http://localhost:3002";
const APP_URL         = process.env.NEXTAUTH_URL                  ?? "http://localhost:3000";

// ── Auth (same helper as checkout route) ─────────────────────────────────────

async function getAccessToken(): Promise<string> {
  // API_KEY from portal is already base64(credentials) — use directly
  const res = await fetch(`${API_BASE}/identity/auth/access-token`, {
    method:  "POST",
    headers: {
      "Authorization": `Basic ${API_KEY}`,
      "Content-Type":  "application/vnd.ni-identity.v1+json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`N-Genius auth failed (${res.status}): ${text}`);
  }
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface NGenius_OrderDetail {
  reference: string;
  amount:    { value: number; currencyCode: string };
  _embedded?: {
    payment?: Array<{ state: string }>;
  };
}

interface ListingRow {
  id:           string;
  developer_id: string;
  wasm_hash:    string;
  price_cents:  number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function redirect(path: string): NextResponse {
  return NextResponse.redirect(new URL(path, APP_URL));
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const params     = req.nextUrl.searchParams;
  const listing_id = params.get("listing_id") ?? "";
  const client_id  = params.get("client_id")  ?? "";
  // N-Genius appends `?ref=` with its canonical reference
  const ngeniusRef = params.get("ref")       ?? params.get("order_ref") ?? "";

  if (!listing_id || !client_id || !ngeniusRef) {
    console.error("[network-intl/callback] missing required query params", { listing_id, client_id, ngeniusRef });
    return redirect("/marketplace?payment=error&reason=missing_params");
  }

  try {
    // 1. Retrieve the order from N-Genius to verify payment state
    const token = await getAccessToken();
    const orderRes = await fetch(
      `${API_BASE}/transactions/outlets/${OUTLET_REF}/orders/${encodeURIComponent(ngeniusRef)}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept":        "application/vnd.ni-payment.v2+json",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!orderRes.ok) {
      console.error(`[network-intl/callback] order lookup failed (${orderRes.status})`);
      return redirect("/marketplace?payment=error&reason=verification_failed");
    }

    const order = await orderRes.json() as NGenius_OrderDetail;

    // Only accept fully-settled payment states before creating a deployment.
    // PURCHASED  = SALE transaction (one-step authorise + capture) ✅
    // CAPTURED   = two-step flow, capture confirmed ✅
    // AUTHORISED = pre-authorised but NOT yet captured — funds not secured ❌
    const paymentState = order._embedded?.payment?.[0]?.state ?? "";
    const isCaptured = ["CAPTURED", "PURCHASED"].includes(paymentState);

    if (!isCaptured) {
      console.warn(`[network-intl/callback] payment not captured — state: ${paymentState}`);
      return redirect(`/marketplace?payment=failed&reason=${encodeURIComponent(paymentState)}`);
    }

    // 2. Fetch listing to get developer details
    const listingRes = await fetch(`${MARKETPLACE_URL}/listings/${listing_id}`, {
      signal: AbortSignal.timeout(5_000),
    });

    if (!listingRes.ok) {
      // Payment succeeded but we can't find the listing — log for manual resolution
      console.error(`[network-intl/callback] listing ${listing_id} not found after successful payment — order ${ngeniusRef}`);
      return redirect("/dashboard?payment=success&note=contact_support");
    }

    const listing = await listingRes.json() as ListingRow;

    // 3. Create deployment — idempotent via transaction_id UUID v7
    // Prefix the stripe_payment_intent_id field with "ni_" so it's distinguishable in audit logs.
    const deployRes = await fetch(`${MARKETPLACE_URL}/deployments`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id:                  listing.id,
        client_id,
        freelancer_id:             listing.developer_id,
        developer_id:              listing.developer_id,
        agent_artifact_hash:       listing.wasm_hash,
        escrow_amount_cents:       order.amount.value,
        stripe_payment_intent_id:  `ni_${ngeniusRef}`,  // namespaced reference for audit trail
        transaction_id:            uuidv7(),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const deployed = deployRes.ok
      ? await deployRes.json() as { deployment_id?: string }
      : null;

    const deploymentId = deployed?.deployment_id ?? "unknown";

    console.log(
      `[network-intl/callback] payment verified (${paymentState}), ` +
      `deployment ${deploymentId} created — order ${ngeniusRef}`,
    );

    return redirect(`/dashboard?payment=success&deployment_id=${deploymentId}`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[network-intl/callback] unhandled error:", msg);
    return redirect("/marketplace?payment=error&reason=server_error");
  }
}
