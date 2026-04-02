"use client";

import { useState, useEffect, useCallback } from "react";
import {
  loadStripe,
  type StripeElementsOptions,
} from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import {
  X, Shield, Lock, Loader2, CheckCircle2, AlertTriangle,
  CreditCard, Globe,
} from "lucide-react";
import { createDeployment } from "@/lib/api";
import type { AgentListing } from "@/lib/api";

// ── Stripe singleton ───────────────────────────────────────────────────────────

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
);

// ── Shared escrow summary ──────────────────────────────────────────────────────

function EscrowSummary({ listing, amountCents }: { listing: AgentListing; amountCents: number }) {
  const platform  = Math.floor(amountCents * 15 / 100);
  const remaining = amountCents - platform;
  const dev       = Math.floor(remaining * 70 / 100);
  const talent    = remaining - dev;

  return (
    <div className="border border-zinc-700 rounded-sm bg-zinc-950 p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-zinc-400">Agent</span>
        <span className="font-mono text-xs text-zinc-200 truncate max-w-[60%]">{listing.name}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-zinc-400">Escrow amount</span>
        <span className="font-mono text-sm font-medium text-amber-400">
          ${(amountCents / 100).toFixed(2)}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-zinc-500">Platform commission (15%)</span>
        <span className="font-mono text-[10px] text-amber-500">${(platform / 100).toFixed(2)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-zinc-600">Developer (70% of net)</span>
        <span className="font-mono text-[10px] text-zinc-500">${(dev / 100).toFixed(2)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-zinc-600">Installer (30% of net)</span>
        <span className="font-mono text-[10px] text-zinc-500">${(talent / 100).toFixed(2)}</span>
      </div>
      <div className="pt-1 border-t border-zinc-800">
        <p className="font-mono text-[10px] text-zinc-600">
          Held in escrow · 30s veto window · 7-day warranty
        </p>
      </div>
    </div>
  );
}

// ── Stripe inner form (must be inside <Elements>) ──────────────────────────────

interface PayFormProps {
  listing:         AgentListing;
  clientId:        string;
  paymentIntentId: string;
  amountCents:     number;
  onSuccess:       (deploymentId: string) => void;
  onCancel:        () => void;
}

function StripePayForm({
  listing,
  clientId,
  paymentIntentId,
  amountCents,
  onSuccess,
  onCancel,
}: PayFormProps) {
  const stripe   = useStripe();
  const elements = useElements();
  const [status, setStatus] = useState<"idle" | "paying" | "deploying" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function handlePay() {
    if (!stripe || !elements) return;
    setStatus("paying");
    setErrMsg(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (error || paymentIntent?.status !== "succeeded") {
      setStatus("error");
      setErrMsg(error?.message ?? "Payment failed — please try again.");
      return;
    }

    setStatus("deploying");
    try {
      const result = await createDeployment({
        agent_id:                 listing.id,
        client_id:                clientId,
        freelancer_id:            listing.developer_id,
        developer_id:             listing.developer_id,
        agent_artifact_hash:      listing.wasm_hash,
        escrow_amount_cents:      amountCents,
        stripe_payment_intent_id: paymentIntentId,
      });
      onSuccess(result.deployment_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus("error");
      setErrMsg(`Payment captured but deployment failed: ${msg}. Contact support with PaymentIntent ${paymentIntentId}.`);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-2">
          Card Details
        </p>
        <div className="rounded-sm border border-zinc-700 bg-zinc-950 p-3">
          <PaymentElement
            options={{
              layout: "tabs",
              fields: { billingDetails: { address: "never" } },
            }}
          />
        </div>
      </div>

      {errMsg && (
        <p className="flex items-start gap-1.5 font-mono text-[10px] text-red-400 border border-red-900 bg-red-950/20 px-2 py-1.5 rounded-sm">
          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" /> {errMsg}
        </p>
      )}

      <p className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-600">
        <Lock className="w-3 h-3" />
        Secured by Stripe · Funds held in escrow until deployment verified
      </p>

      <div className="flex gap-2">
        <button
          onClick={handlePay}
          disabled={!stripe || status === "paying" || status === "deploying"}
          className="flex-1 h-11 flex items-center justify-center gap-2 rounded-sm
                     bg-amber-400 hover:bg-amber-300 disabled:bg-zinc-700 disabled:text-zinc-500
                     text-zinc-950 font-mono text-sm font-medium transition-all active:scale-[0.98]"
        >
          {status === "paying"    && <><Loader2 className="w-4 h-4 animate-spin" /> Confirming payment…</>}
          {status === "deploying" && <><Loader2 className="w-4 h-4 animate-spin" /> Starting deployment…</>}
          {(status === "idle" || status === "error") && (
            <><Shield className="w-4 h-4" /> Pay ${(amountCents / 100).toFixed(2)} &amp; Deploy</>
          )}
        </button>
        <button
          onClick={onCancel}
          disabled={status === "paying" || status === "deploying"}
          className="h-11 px-4 rounded-sm border border-zinc-700 text-zinc-400
                     font-mono text-sm hover:border-zinc-500 hover:text-zinc-300
                     disabled:opacity-40 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── N-Genius payment form ──────────────────────────────────────────────────────

function NetworkIntlPayForm({
  listing,
  clientId,
  amountCents,
  country,
  onCancel,
}: {
  listing:      AgentListing;
  clientId:     string;
  amountCents:  number;
  country:      string;
  onCancel:     () => void;
}) {
  const [status, setStatus] = useState<"idle" | "creating" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function handleProceed() {
    setStatus("creating");
    setErrMsg(null);

    try {
      const res = await fetch("/api/network-intl/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_cents: amountCents,
          listing_id:   listing.id,
          agent_name:   listing.name,
          client_id:    clientId,
          country,                  // lets backend confirm AED vs USD
        }),
      });

      const data = await res.json() as {
        payment_url?: string;
        error?:       string;
      };

      if (data.error || !data.payment_url) {
        throw new Error(data.error ?? "No payment URL returned");
      }

      // Redirect to N-Genius hosted payment page (full-page navigation)
      window.location.href = data.payment_url;
    } catch (err) {
      setStatus("error");
      setErrMsg(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-4">
      {/* Info block */}
      <div className="border border-zinc-700 rounded-sm bg-zinc-950 p-3 space-y-2">
        <p className="font-mono text-xs text-zinc-300 font-medium">Network International</p>
        <p className="font-mono text-[10px] text-zinc-500 leading-relaxed">
          You will be redirected to the N-Genius secure payment page to complete your
          payment. After confirmation, you will return to AiStaff automatically.
        </p>
        <div className="pt-1 border-t border-zinc-800 flex flex-wrap gap-2">
          {["Visa", "Mastercard", "Amex", "Apple Pay", "Google Pay"].map((m) => (
            <span key={m} className="font-mono text-[9px] text-zinc-600 border border-zinc-800 px-1.5 py-0.5 rounded-sm">
              {m}
            </span>
          ))}
        </div>
      </div>

      {errMsg && (
        <p className="flex items-start gap-1.5 font-mono text-[10px] text-red-400 border border-red-900 bg-red-950/20 px-2 py-1.5 rounded-sm">
          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" /> {errMsg}
        </p>
      )}

      <p className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-600">
        <Lock className="w-3 h-3" />
        3D Secure enabled · Funds held in escrow until deployment verified
      </p>

      <div className="flex gap-2">
        <button
          onClick={handleProceed}
          disabled={status === "creating"}
          className="flex-1 h-11 flex items-center justify-center gap-2 rounded-sm
                     bg-amber-400 hover:bg-amber-300 disabled:bg-zinc-700 disabled:text-zinc-500
                     text-zinc-950 font-mono text-sm font-medium transition-all active:scale-[0.98]"
        >
          {status === "creating"
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating order…</>
            : <><Globe className="w-4 h-4" /> Pay ${(amountCents / 100).toFixed(2)} via N-Genius</>
          }
        </button>
        <button
          onClick={onCancel}
          disabled={status === "creating"}
          className="h-11 px-4 rounded-sm border border-zinc-700 text-zinc-400
                     font-mono text-sm hover:border-zinc-500 hover:text-zinc-300
                     disabled:opacity-40 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Gateway selector tabs ─────────────────────────────────────────────────────

type Gateway = "stripe" | "network_intl";

function GatewayTabs({ active, onChange }: { active: Gateway; onChange: (g: Gateway) => void }) {
  const tabs: Array<{ id: Gateway; label: string; sub: string; icon: React.ElementType }> = [
    { id: "stripe",       label: "Stripe",    sub: "USD",      icon: CreditCard },
    { id: "network_intl", label: "N-Genius",  sub: "AED",      icon: Globe },
  ];

  return (
    <div className="flex gap-1 p-0.5 rounded-sm border border-zinc-800 bg-zinc-950">
      {tabs.map(({ id, label, sub, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-sm
                      font-mono text-[10px] uppercase tracking-widest transition-all
                      ${active === id
                        ? "bg-zinc-800 text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-300"
                      }`}
        >
          <Icon className="w-3 h-3 flex-shrink-0" />
          <span>{label}</span>
          <span className={`text-[9px] px-1 rounded-sm ${active === id ? "bg-zinc-700 text-amber-400" : "text-zinc-600"}`}>
            {sub}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── PaymentModal ───────────────────────────────────────────────────────────────

interface PaymentModalProps {
  listing:   AgentListing | null;
  clientId:  string;
  onSuccess: (deploymentId: string, listingId: string) => void;
  onClose:   () => void;
}

export function PaymentModal({ listing, clientId, onSuccess, onClose }: PaymentModalProps) {
  const [gateway,           setGateway]          = useState<Gateway>("stripe");
  const [geoLoading,        setGeoLoading]        = useState(true);
  const [detectedCountry,   setDetectedCountry]   = useState<string>("AE");
  const [clientSecret,      setClientSecret]      = useState<string | null>(null);
  const [paymentIntentId,   setPaymentIntentId]   = useState<string>("");
  const [loadingIntent,     setLoadingIntent]     = useState(false);
  const [intentError,       setIntentError]       = useState<string | null>(null);
  const [paid,              setPaid]              = useState(false);

  const createStripeIntent = useCallback(async (lst: AgentListing) => {
    setLoadingIntent(true);
    setIntentError(null);
    try {
      const res = await fetch("/api/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_cents: lst.price_cents,
          listing_id:   lst.id,
          agent_name:   lst.name,
          client_id:    clientId,
        }),
      });
      const data = await res.json() as {
        client_secret?:      string;
        payment_intent_id?:  string;
        error?:              string;
      };
      if (data.error || !data.client_secret) {
        throw new Error(data.error ?? "No client_secret returned");
      }
      setClientSecret(data.client_secret);
      setPaymentIntentId(data.payment_intent_id ?? "");
    } catch (err) {
      setIntentError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingIntent(false);
    }
  }, [clientId]);

  // Auto-detect country on open → route AE to N-Genius, all others to Stripe.
  // Runs whenever the modal opens (listing goes null→value).
  useEffect(() => {
    if (!listing) {
      // Reset for next open
      setGeoLoading(true);
      setDetectedCountry("AE");
      setGateway("stripe");
      setClientSecret(null);
      setPaymentIntentId("");
      setPaid(false);
      return;
    }

    setGeoLoading(true);
    fetch("/api/geo")
      .then((r) => r.json())
      .then(({ country }: { country: string }) => {
        setDetectedCountry(country);
        // AE (UAE) → N-Genius (AED), all others → Stripe (USD)
        setGateway(country === "AE" ? "network_intl" : "stripe");
      })
      .catch(() => {
        setDetectedCountry("AE");
        setGateway("stripe"); // safe fallback on geo failure
      })
      .finally(() => {
        setGeoLoading(false);
      });
  }, [listing]);

  // Create a Stripe PaymentIntent only when Stripe gateway is active.
  // Waits for geo detection to complete first (geoLoading guard) so we don't
  // fire a wasted Stripe API call for UAE users before switching to N-Genius.
  useEffect(() => {
    if (!listing || geoLoading) return;
    if (gateway === "stripe") {
      createStripeIntent(listing).catch(() => {});
    } else {
      // Clear Stripe state when switching to N-Genius
      setClientSecret(null);
      setPaymentIntentId("");
      setIntentError(null);
    }
  }, [listing, gateway, geoLoading, createStripeIntent]);

  if (!listing) return null;

  const stripeOptions: StripeElementsOptions = clientSecret
    ? {
        clientSecret,
        appearance: {
          theme: "night",
          variables: {
            colorPrimary:    "#fbbf24",
            colorBackground: "#09090b",
            colorText:       "#fafafa",
            colorDanger:     "#ef4444",
            fontFamily:      "ui-monospace, monospace",
            borderRadius:    "2px",
            fontSizeBase:    "13px",
          },
        },
      }
    : {};

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-zinc-900 border-t border-zinc-700 rounded-t-sm p-5 space-y-4
                      safe-area-inset-bottom">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Escrow Payment</p>
            <p className="font-mono text-sm text-zinc-100 font-medium mt-0.5">{listing.name}</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-sm border border-zinc-700
                       text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success state */}
        {paid ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            <p className="font-mono text-sm text-zinc-100">Deployment started!</p>
            <p className="font-mono text-xs text-zinc-500">
              Veto window will open on your dashboard in 30 seconds.
            </p>
          </div>
        ) : (
          <>
            {/* Escrow breakdown */}
            <EscrowSummary listing={listing} amountCents={listing.price_cents} />

            {/* Gateway selector — shown after geo detection */}
            {geoLoading ? (
              <div className="flex items-center justify-center gap-2 py-1 text-zinc-600">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="font-mono text-[10px]">Detecting region…</span>
              </div>
            ) : (
              <GatewayTabs active={gateway} onChange={setGateway} />
            )}

            {/* ── Stripe flow ─────────────────────────────────────────────── */}
            {!geoLoading && gateway === "stripe" && (
              loadingIntent ? (
                <div className="flex items-center justify-center py-8 gap-2 text-zinc-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="font-mono text-xs">Preparing payment…</span>
                </div>
              ) : intentError ? (
                <div className="space-y-3">
                  <p className="flex items-start gap-1.5 font-mono text-xs text-red-400 border border-red-900 bg-red-950/20 px-2 py-1.5 rounded-sm">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {intentError}
                  </p>
                  <button
                    onClick={() => createStripeIntent(listing)}
                    className="w-full h-9 font-mono text-xs text-zinc-400 border border-zinc-700 rounded-sm hover:border-zinc-500"
                  >
                    Retry
                  </button>
                </div>
              ) : clientSecret ? (
                <Elements stripe={stripePromise} options={stripeOptions}>
                  <StripePayForm
                    listing={listing}
                    clientId={clientId}
                    paymentIntentId={paymentIntentId}
                    amountCents={listing.price_cents}
                    onSuccess={(deploymentId) => {
                      setPaid(true);
                      setTimeout(() => {
                        onSuccess(deploymentId, listing.id);
                        onClose();
                      }, 1800);
                    }}
                    onCancel={onClose}
                  />
                </Elements>
              ) : null
            )}

            {/* ── N-Genius flow ────────────────────────────────────────────── */}
            {!geoLoading && gateway === "network_intl" && (
              <NetworkIntlPayForm
                listing={listing}
                clientId={clientId}
                amountCents={listing.price_cents}
                country={detectedCountry}
                onCancel={onClose}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
