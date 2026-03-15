export const runtime = "nodejs";

/**
 * POST /api/network-intl/checkout
 *
 * Creates an N-Genius Online payment order and returns the hosted payment
 * page URL. The browser redirects the user to that URL; on completion
 * N-Genius redirects back to /api/network-intl/callback.
 *
 * Docs: https://docs.ngenius-payments.com/reference/creating-orders
 */

import { NextRequest, NextResponse } from "next/server";
import { v7 as uuidv7 } from "uuid";

const API_BASE   = process.env.NETWORK_INTL_API_BASE   ?? "https://api-gateway.sandbox.ngenius-payments.com";
const API_KEY    = process.env.NETWORK_INTL_API_KEY    ?? "";
const OUTLET_REF = process.env.NETWORK_INTL_OUTLET_REF ?? "";
const APP_URL    = process.env.NEXTAUTH_URL             ?? "http://localhost:3000";

// ── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Exchange the API key for a short-lived bearer token (TTL: 5 min).
 * N-Genius Basic auth format: base64("apiKey:") — key + colon, empty password.
 * No request body — credentials are carried entirely in the Authorization header.
 */
async function getAccessToken(): Promise<string> {
  // HTTP Basic auth: base64(username:password). N-Genius uses apiKey as username, no password.
  const encoded = Buffer.from(`${API_KEY}:`).toString("base64");
  const res = await fetch(`${API_BASE}/identity/auth/access-token`, {
    method:  "POST",
    headers: {
      "Authorization": `Basic ${encoded}`,
      "Content-Type":  "application/vnd.ni-identity.v1+json",
    },
    // No body — N-Genius access-token endpoint takes credentials from header only
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
  amount_cents:  number;   // USD cents
  listing_id:    string;
  agent_name:    string;
  client_id:     string;
  currency?:     string;   // ISO 4217 — defaults to USD
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

  const { amount_cents, listing_id, agent_name, client_id, currency = "USD" } = body;

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
            value:        amount_cents,
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
      amount_cents,
      currency,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[network-intl/checkout] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
