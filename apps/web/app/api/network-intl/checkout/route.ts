export const runtime = "nodejs";

/**
 * POST /api/network-intl/checkout
 *
 * Creates an N-Genius Online payment order and returns the hosted payment
 * page URL. The browser redirects the user to that URL; on completion
 * N-Genius redirects back to /api/network-intl/callback.
 *
 * Currency auto-detection:
 *   Cloudflare injects CF-IPCountry on every request (zero cost, no API).
 *   UAE (AE) → AED (fils, pegged 3.6725 AED/USD — stable, no live FX needed)
 *   All others → USD (cents)
 *
 * Docs: https://docs.ngenius-payments.com/reference/creating-orders
 */

import { NextRequest, NextResponse } from "next/server";
import { v7 as uuidv7 } from "uuid";

const API_BASE   = process.env.NETWORK_INTL_API_BASE   ?? "https://api-gateway.sandbox.ngenius-payments.com";
const API_KEY    = process.env.NETWORK_INTL_API_KEY    ?? "";
const OUTLET_REF = process.env.NETWORK_INTL_OUTLET_REF ?? "";
const APP_URL    = process.env.NEXTAUTH_URL             ?? "http://localhost:3000";

// AED is pegged to USD at 3.6725 (Central Bank of UAE fixed rate).
// N-Genius amount.value = smallest currency unit: fils for AED (100 fils = 1 AED).
// Formula: USD_cents → AED_fils = floor(cents × 36725 / 10000)
const USD_CENTS_TO_AED_FILS = (cents: number): number =>
  Math.floor(cents * 36725 / 10000);

// ── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Exchange the API key for a short-lived bearer token (TTL: 5 min).
 * The N-Genius portal issues the API key already base64-encoded.
 * Use it as-is in the Authorization header — do NOT re-encode it.
 */
async function getAccessToken(): Promise<string> {
  const res = await fetch(`${API_BASE}/identity/auth/access-token`, {
    method:  "POST",
    headers: {
      // API_KEY from portal is already base64(credentials) — use directly
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

// ── Request / Response types ──────────────────────────────────────────────────

export interface NetworkIntlCheckoutRequest {
  amount_cents:  number;   // USD cents — server converts to local currency
  listing_id:    string;
  agent_name:    string;
  client_id:     string;
}

interface NGenius_OrderResponse {
  reference: string;
  _links: {
    payment: { href: string };
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: NetworkIntlCheckoutRequest;
  try {
    body = await req.json() as NetworkIntlCheckoutRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { amount_cents, listing_id, agent_name, client_id } = body;

  if (!amount_cents || amount_cents < 100) {
    return NextResponse.json(
      { error: "amount_cents must be at least 100 (smallest N-Genius unit)" },
      { status: 400 },
    );
  }

  if (!listing_id || !client_id) {
    return NextResponse.json(
      { error: "listing_id and client_id are required" },
      { status: 400 },
    );
  }

  // Guard: payment gateway must be configured
  if (!API_KEY) {
    console.error("[network-intl/checkout] NETWORK_INTL_API_KEY not set");
    return NextResponse.json({ error: "Payment gateway not configured (API key missing)" }, { status: 503 });
  }
  if (!OUTLET_REF) {
    console.error("[network-intl/checkout] NETWORK_INTL_OUTLET_REF not set");
    return NextResponse.json({ error: "Payment gateway not configured (outlet ref missing)" }, { status: 503 });
  }

  // ── Currency detection ───────────────────────────────────────────────────────
  // Cloudflare injects CF-IPCountry on every proxied request (zero cost).
  // When Cloudflare is NOT in front (direct Traefik / Let's Encrypt), the
  // header is absent. The N-Genius outlet is configured for AED (UAE merchant),
  // so we default to AED whenever country cannot be determined. Only switch to
  // USD if Cloudflare explicitly identifies a non-UAE origin AND the outlet
  // has USD enabled (add USD in the N-Genius portal if needed).
  const cfCountry = (req.headers.get("cf-ipcountry") ?? "").toUpperCase();
  const useAED    = !cfCountry || cfCountry === "AE"; // default AED when header absent
  const currency  = useAED ? "AED" : "USD";
  // Convert: USD cents → AED fils (pegged 3.6725, lossless integer math)
  const orderAmount = useAED ? USD_CENTS_TO_AED_FILS(amount_cents) : amount_cents;

  console.log(
    `[network-intl/checkout] country=${cfCountry || "absent/unknown"} ` +
    `currency=${currency} amount=${orderAmount} (from ${amount_cents} USD cents)`,
  );

  // Deterministic order reference per payment attempt for idempotency audit trail
  const merchantOrderRef = uuidv7();

  // Callback URL carries listing + client context for deployment creation on return
  const redirectUrl =
    `${APP_URL}/api/network-intl/callback` +
    `?listing_id=${encodeURIComponent(listing_id)}` +
    `&client_id=${encodeURIComponent(client_id)}` +
    `&order_ref=${encodeURIComponent(merchantOrderRef)}`;

  const cancelUrl = `${APP_URL}/marketplace?payment=cancelled`;

  try {
    const token = await getAccessToken();

    const orderRes = await fetch(
      `${API_BASE}/transactions/outlets/${OUTLET_REF}/orders`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type":  "application/vnd.ni-payment.v2+json",
          "Accept":        "application/vnd.ni-payment.v2+json",
        },
        body: JSON.stringify({
          action: "SALE", // immediate authorise + capture
          amount: {
            currencyCode: currency,
            value:        orderAmount,
          },
          merchantAttributes: {
            redirectUrl,
            cancelUrl,
            merchantOrderReference: merchantOrderRef,
            skip3DS: false,
          },
          description: `AiStaff escrow — ${agent_name.slice(0, 200)}`,
          // Carry metadata through the order for webhook resilience
          merchantDefinedData: {
            field1: listing_id,
            field2: client_id,
            field3: "aistaff",
          },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!orderRes.ok) {
      const text = await orderRes.text();
      throw new Error(`N-Genius order creation failed (${orderRes.status}): ${text}`);
    }

    const order = await orderRes.json() as NGenius_OrderResponse;

    return NextResponse.json({
      payment_url:  order._links.payment.href,
      order_ref:    order.reference,
      amount_cents,   // original USD cents (for audit / display)
      currency,       // resolved currency (AED or USD)
      order_amount:  orderAmount,  // amount sent to N-Genius (fils or cents)
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[network-intl/checkout] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
