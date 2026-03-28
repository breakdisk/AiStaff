export const runtime = "nodejs";

// Stripe requires the raw body — no JSON parsing by Next.js.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { v7 as uuidv7 } from "uuid";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", {
  apiVersion: "2025-02-24.acacia",
});

const WEBHOOK_SECRET   = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const MARKETPLACE_URL  = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

// ── Types ───────────────────────────────────────────────────────────────────

interface ListingRow {
  id:           string;
  developer_id: string;
  wasm_hash:    string;
  price_cents:  number;
  name:         string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resilience path: if the browser was closed after the Stripe charge succeeded
 * but before `POST /deployments` completed, this webhook creates the deployment.
 *
 * Guards:
 * 1. Fetch listing — if it no longer exists, skip (stale metadata).
 * 2. Check for existing deployment by stripe_payment_intent_id — skip if found.
 * 3. Create deployment with fresh UUID v7 transaction_id.
 */
async function ensureDeploymentExists(
  pi: Stripe.PaymentIntent,
  listing_id: string,
  client_id:  string,
): Promise<void> {
  // 1. Fetch listing to get developer_id + wasm_hash
  let listing: ListingRow;
  try {
    const r = await fetch(`${MARKETPLACE_URL}/listings/${listing_id}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) {
      console.warn(`[stripe-webhook] listing ${listing_id} not found (${r.status}) — skipping resilience path`);
      return;
    }
    listing = await r.json() as ListingRow;
  } catch (err) {
    console.error("[stripe-webhook] failed to fetch listing:", err);
    return;
  }

  // 2. Check if a deployment already exists for this PaymentIntent
  try {
    const check = await fetch(
      `${MARKETPLACE_URL}/deployments/by-payment-intent/${encodeURIComponent(pi.id)}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (check.ok) {
      return; // deployment already exists — idempotent skip
    }
    // 404 = not found → proceed to create
    if (check.status !== 404) {
      console.warn(`[stripe-webhook] unexpected status ${check.status} checking deployment — skipping`);
      return;
    }
  } catch {
    // marketplace may be temporarily down — log and skip rather than double-creating
    console.warn("[stripe-webhook] could not check existing deployment — skipping resilience path");
    return;
  }

  // 3. Create the deployment
  const body = JSON.stringify({
    agent_id:                  listing.id,
    client_id,
    freelancer_id:             listing.developer_id,
    developer_id:              listing.developer_id,
    agent_artifact_hash:       listing.wasm_hash,
    escrow_amount_cents:       pi.amount,
    stripe_payment_intent_id:  pi.id,
    transaction_id:            uuidv7(),
  });

  try {
    const r = await fetch(`${MARKETPLACE_URL}/deployments`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal:  AbortSignal.timeout(10_000),
    });
    if (r.ok) {
      await r.json(); // consume body
    } else {
      const text = await r.text();
      console.error(`[stripe-webhook] POST /deployments failed (${r.status}): ${text}`);
    }
  } catch (err) {
    console.error("[stripe-webhook] failed to create deployment:", err);
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const sig  = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stripe-webhook] signature verification failed:", msg);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ── payment_intent.succeeded ────────────────────────────────────────────
  // Primary path: frontend already called POST /deployments after confirmPayment().
  // Resilience path: browser was closed — we create the deployment here.
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const { listing_id, client_id } = pi.metadata;

    if (listing_id && client_id) {
      await ensureDeploymentExists(pi, listing_id, client_id);
    } else {
      console.warn(`[stripe-webhook] PI ${pi.id} missing listing_id or client_id in metadata`);
    }
  }

  // ── payment_intent.payment_failed ──────────────────────────────────────
  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    console.warn(
      `[stripe-webhook] PaymentIntent ${pi.id} FAILED — ` +
      `${pi.last_payment_error?.message ?? "unknown error"}`,
    );
    // Deployment should not have been created (frontend guards on confirmPayment success).
  }

  return NextResponse.json({ received: true });
}
