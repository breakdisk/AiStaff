export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/network-intl/webhook
 *
 * N-Genius server-to-server webhook for payment events.
 * Configure the endpoint URL in the N-Genius merchant portal:
 *   Settings → Integrations → Webhooks → New
 *   URL: https://aistaffglobal.com/api/network-intl/webhook
 *
 * CRITICAL:
 * - Must respond HTTP 200 within 15 seconds or N-Genius marks delivery failed.
 * - N-Genius does NOT retry failed deliveries — make the callback resilient.
 * - The redirect callback (/api/network-intl/callback) already creates the
 *   deployment. This webhook is the resilience layer for edge cases where
 *   the user's browser never returned (tab closed mid-redirect, etc.).
 *
 * Docs: https://docs.ngenius-payments.com/reference/consuming-web-hooks
 */

import { NextRequest, NextResponse } from "next/server";
import { v7 as uuidv7 } from "uuid";

const API_BASE          = process.env.NETWORK_INTL_API_BASE          ?? "https://api-gateway.sandbox.ngenius-payments.com";
const API_KEY           = process.env.NETWORK_INTL_API_KEY           ?? "";
const OUTLET_REF        = process.env.NETWORK_INTL_OUTLET_REF        ?? "";
const MARKETPLACE_URL   = process.env.MARKETPLACE_SERVICE_URL        ?? "http://localhost:3002";
// Custom header configured in N-Genius portal → Settings → Integrations → Webhooks
// Header Key:   X-Webhook-Secret
// Header Value: <value of NETWORK_INTL_WEBHOOK_SECRET env var>
const WEBHOOK_SECRET    = process.env.NETWORK_INTL_WEBHOOK_SECRET    ?? "";

// ── Auth ─────────────────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  const encoded = Buffer.from(API_KEY).toString("base64");
  const res = await fetch(`${API_BASE}/identity/auth/access-token`, {
    method:  "POST",
    headers: {
      "Authorization": `Basic ${encoded}`,
      "Content-Type":  "application/vnd.ni-identity.v1+json",
    },
    signal: AbortSignal.timeout(8_000),
  });
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

// ── Webhook payload types ─────────────────────────────────────────────────────

interface NGenius_WebhookPayload {
  event:      string;           // "CAPTURED" | "AUTHORISED" | "DECLINED" | …
  outletId:   string;
  order: {
    id:        string;
    reference: string;          // merchantOrderReference we set at order creation
    amount:    { value: number; currencyCode: string };
    merchantDefinedData?: {
      field1?: string;          // listing_id
      field2?: string;          // client_id
      field3?: string;          // "aistaff"
    };
  };
  transaction?: {
    id:    string;
    state: string;
  };
  timestamp: string;
}

// ── Resilience: create deployment if not yet exists ───────────────────────────

async function ensureDeploymentExists(payload: NGenius_WebhookPayload): Promise<void> {
  const listing_id = payload.order.merchantDefinedData?.field1;
  const client_id  = payload.order.merchantDefinedData?.field2;
  const orderRef   = payload.order.reference;

  if (!listing_id || !client_id) {
    console.warn(`[network-intl/webhook] no listing_id/client_id in merchantDefinedData for order ${orderRef}`);
    return;
  }

  // 1. Check if a deployment already exists for this N-Genius order reference
  try {
    const check = await fetch(
      `${MARKETPLACE_URL}/deployments/by-payment-intent/${encodeURIComponent(`ni_${orderRef}`)}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (check.ok) {
      console.log(`[network-intl/webhook] deployment already exists for order ${orderRef} — skipping`);
      return;
    }
    if (check.status !== 404) {
      console.warn(`[network-intl/webhook] unexpected status ${check.status} checking deployment`);
      return;
    }
  } catch {
    console.warn("[network-intl/webhook] could not check existing deployment — skipping resilience path");
    return;
  }

  // 2. Fetch listing details
  let listing: { id: string; developer_id: string; wasm_hash: string } | null = null;
  try {
    const r = await fetch(`${MARKETPLACE_URL}/listings/${listing_id}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (r.ok) listing = await r.json() as typeof listing;
  } catch {
    /* non-fatal — log below */
  }

  if (!listing) {
    console.error(`[network-intl/webhook] listing ${listing_id} not found — cannot create deployment for order ${orderRef}`);
    return;
  }

  // 3. Create deployment
  try {
    const r = await fetch(`${MARKETPLACE_URL}/deployments`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id:                  listing.id,
        client_id,
        freelancer_id:             listing.developer_id,
        developer_id:              listing.developer_id,
        agent_artifact_hash:       listing.wasm_hash,
        escrow_amount_cents:       payload.order.amount.value,
        stripe_payment_intent_id:  `ni_${orderRef}`,
        transaction_id:            uuidv7(),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (r.ok) {
      const created = await r.json() as { deployment_id?: string };
      console.log(`[network-intl/webhook] resilience deployment created: ${created.deployment_id} for order ${orderRef}`);
    } else {
      const text = await r.text();
      console.error(`[network-intl/webhook] POST /deployments failed (${r.status}): ${text}`);
    }
  } catch (err) {
    console.error("[network-intl/webhook] failed to create deployment:", err);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Custom header authentication ─────────────────────────────────────────
  // N-Genius sends the Header Key/Value you configured in the portal.
  // Header Key:   X-Webhook-Secret
  // Header Value: NETWORK_INTL_WEBHOOK_SECRET env var
  if (WEBHOOK_SECRET) {
    const incoming = req.headers.get("x-webhook-secret") ?? "";
    if (incoming !== WEBHOOK_SECRET) {
      console.error("[network-intl/webhook] invalid webhook secret — request rejected");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    // Secret not configured — log a warning but allow through (dev/sandbox only).
    console.warn("[network-intl/webhook] NETWORK_INTL_WEBHOOK_SECRET not set — skipping auth (set in production)");
  }

  // Respond quickly — N-Genius requires HTTP 200 within 15 seconds.
  const body = await req.text();

  let payload: NGenius_WebhookPayload;
  try {
    payload = JSON.parse(body) as NGenius_WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event, order, transaction } = payload;

  console.log(
    `[network-intl/webhook] event=${event} ` +
    `order=${order?.reference} ` +
    `txn=${transaction?.id ?? "—"} ` +
    `state=${transaction?.state ?? "—"}`,
  );

  // CAPTURED / AUTHORISED = payment succeeded
  if (event === "CAPTURED" || event === "AUTHORISED") {
    await ensureDeploymentExists(payload);
  }

  // DECLINED / AUTHORISATION_FAILED = payment did not succeed
  if (event === "DECLINED" || event === "AUTHORISATION_FAILED") {
    console.warn(
      `[network-intl/webhook] payment declined — order ${order?.reference}`,
    );
    // No deployment to create. The user will see the failure state on return.
  }

  // Refund events — log for now; full refund flow is in the roadmap
  if (event === "REFUNDED" || event === "PARTIALLY_REFUNDED") {
    console.log(
      `[network-intl/webhook] refund event ${event} — order ${order?.reference} ` +
      `— amount ${order?.amount?.value} ${order?.amount?.currencyCode}`,
    );
    // TODO (post-MVP): update deployment payment_status = 'refunded', emit Kafka event
  }

  // Suppress unused import warning for getAccessToken — used by ensureDeploymentExists indirectly
  void getAccessToken;

  return NextResponse.json({ received: true });
}
