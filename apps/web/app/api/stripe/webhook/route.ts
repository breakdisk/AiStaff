export const runtime = "nodejs";

// Stripe requires the raw body — no JSON parsing by Next.js.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", {
  apiVersion: "2025-02-24.acacia",
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

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

  // ── payment_intent.succeeded ────────────────────────────────────────────────
  // Fires after the card charge is confirmed by Stripe.
  // The frontend already optimistically triggered the deployment; this webhook
  // serves as the robustness layer (e.g., if the browser was closed after pay).
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const { listing_id, client_id, agent_name } = pi.metadata;

    console.log(
      `[stripe-webhook] PaymentIntent ${pi.id} confirmed — ` +
      `$${(pi.amount / 100).toFixed(2)} USD — listing ${listing_id} — client ${client_id}`,
    );

    // TODO: If no deployment exists for this payment_intent_id yet
    // (browser was closed before POST /deployments), create it here for resilience.
    // For now: the frontend POST /deployments already runs on confirmPayment() success.
    void agent_name; // suppress unused-variable warning
  }

  // ── payment_intent.payment_failed ──────────────────────────────────────────
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
