export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", {
  apiVersion: "2025-02-24.acacia",
});

export interface CheckoutRequest {
  amount_cents:  number;   // escrow amount in USD cents
  listing_id:    string;   // agent_listings.id
  agent_name:    string;   // for Stripe metadata + receipt
  client_id:     string;   // unified_profiles.id of the buyer
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: CheckoutRequest;
  try {
    body = await req.json() as CheckoutRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { amount_cents, listing_id, agent_name, client_id } = body;

  if (!amount_cents || amount_cents < 50) {
    return NextResponse.json(
      { error: "amount_cents must be at least 50 (50 USD cents = $0.50)" },
      { status: 400 },
    );
  }

  if (!listing_id || !client_id) {
    return NextResponse.json(
      { error: "listing_id and client_id are required" },
      { status: 400 },
    );
  }

  try {
    // Create a PaymentIntent for the exact escrow amount.
    // The client_secret is sent to the browser so Stripe Elements can confirm it.
    const paymentIntent = await stripe.paymentIntents.create({
      amount:   amount_cents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        listing_id,
        agent_name:   agent_name.slice(0, 200),
        client_id,
        platform:     "aistaff",
      },
      description: `AiStaff escrow — ${agent_name}`,
    });

    return NextResponse.json({
      client_secret:       paymentIntent.client_secret,
      payment_intent_id:   paymentIntent.id,
      amount_cents,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[checkout] Stripe error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
