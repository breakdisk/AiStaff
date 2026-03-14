"use client";

import { useState, useCallback } from "react";
import {
  X, Link2, Check, Mail, Twitter, Linkedin,
  MessageCircle, Share2,
} from "lucide-react";
import type { AgentListing } from "@/lib/api";

// ── Helpers ─────────────────────────────────────────────────────────────────

const BASE_URL =
  typeof window !== "undefined"
    ? window.location.origin
    : "https://aistaffglobal.com";

function listingUrl(id: string) {
  return `${BASE_URL}/listings/${id}`;
}

function twitterIntent(listing: AgentListing) {
  const text = `Check out "${listing.name}" on AiStaff — ${fmtPrice(listing.price_cents)} escrow deployment`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(listingUrl(listing.id))}`;
}

function linkedinShare(listing: AgentListing) {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(listingUrl(listing.id))}`;
}

function whatsappShare(listing: AgentListing) {
  const text = `"${listing.name}" — ${fmtPrice(listing.price_cents)} · Deploy with AiStaff escrow: ${listingUrl(listing.id)}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function mailtoLink(listing: AgentListing) {
  const subject = `AiStaff listing: ${listing.name}`;
  const body =
    `Hi,\n\nI found this AI agent listing that might interest you:\n\n` +
    `${listing.name}\n${listing.description}\n\n` +
    `Price: ${fmtPrice(listing.price_cents)} (held in escrow)\n\n` +
    `View it here: ${listingUrl(listing.id)}\n\n— Shared via AiStaff`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function fmtPrice(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(cents / 100);
}

// ── Share trigger button ─────────────────────────────────────────────────────

interface ShareButtonProps {
  listing:  AgentListing;
  compact?: boolean;
}

export function ShareButton({ listing, compact }: ShareButtonProps) {
  const [open, setOpen] = useState(false);

  const h  = compact ? "h-7 w-7" : "h-8 w-8";

  return (
    <>
      <button
        aria-label={`Share ${listing.name}`}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={`${h} flex items-center justify-center rounded-sm border border-zinc-700
                   text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors`}
      >
        <Share2 className="w-3.5 h-3.5" />
      </button>

      {open && (
        <ShareSheet
          listing={listing}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ── ShareSheet bottom sheet ──────────────────────────────────────────────────

interface ShareSheetProps {
  listing: AgentListing;
  onClose: () => void;
}

export function ShareSheet({ listing, onClose }: ShareSheetProps) {
  const [copied, setCopied] = useState(false);

  const url = listingUrl(listing.id);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [url]);

  const handleNativeShare = useCallback(async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: listing.name,
          text:  `${listing.name} — ${fmtPrice(listing.price_cents)} escrow deployment on AiStaff`,
          url,
        });
        onClose();
        return true;
      } catch {
        // User cancelled or browser unsupported — fall through to sheet
      }
    }
    return false;
  }, [listing, url, onClose]);

  // Attempt native share on open; if unavailable, sheet stays open
  // (called by parent if desired — here we just render the sheet)

  const SHARE_OPTIONS = [
    {
      id:    "copy",
      label: copied ? "Copied!" : "Copy link",
      icon:  copied ? Check : Link2,
      color: copied ? "text-emerald-400" : "text-zinc-300",
      action: handleCopy,
    },
    {
      id:    "twitter",
      label: "Share on X / Twitter",
      icon:  Twitter,
      color: "text-zinc-300",
      action: () => { window.open(twitterIntent(listing), "_blank", "noopener,noreferrer"); },
    },
    {
      id:    "linkedin",
      label: "Share on LinkedIn",
      icon:  Linkedin,
      color: "text-sky-400",
      action: () => { window.open(linkedinShare(listing), "_blank", "noopener,noreferrer"); },
    },
    {
      id:    "whatsapp",
      label: "Share on WhatsApp",
      icon:  MessageCircle,
      color: "text-emerald-400",
      action: () => { window.open(whatsappShare(listing), "_blank", "noopener,noreferrer"); },
    },
    {
      id:    "email",
      label: "Send via Email",
      icon:  Mail,
      color: "text-zinc-300",
      action: () => { window.location.href = mailtoLink(listing); },
    },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed z-50 bottom-0 left-0 right-0 max-w-lg mx-auto
                      bg-zinc-900 border-t border-zinc-700 rounded-t-sm
                      safe-area-inset-bottom">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-zinc-800">
          <div className="min-w-0 pr-3">
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Share listing</p>
            <p className="font-mono text-sm text-zinc-100 font-medium truncate mt-0.5">{listing.name}</p>
            <p className="font-mono text-xs text-amber-400 mt-0.5">{fmtPrice(listing.price_cents)}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close share sheet"
            className="h-8 w-8 flex items-center justify-center flex-shrink-0
                       rounded-sm border border-zinc-700 text-zinc-500
                       hover:text-zinc-300 hover:border-zinc-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Link preview */}
        <div className="mx-4 mt-4 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-sm">
          <p className="font-mono text-[10px] text-zinc-600 truncate">{url}</p>
        </div>

        {/* Native share (mobile only) */}
        {typeof navigator !== "undefined" && "share" in navigator && (
          <div className="px-4 pt-3">
            <button
              onClick={handleNativeShare}
              className="w-full h-10 flex items-center justify-center gap-2
                         rounded-sm bg-amber-400 hover:bg-amber-300
                         font-mono text-sm font-medium text-zinc-950
                         transition-all active:scale-[0.98]"
            >
              <Share2 className="w-4 h-4" /> Share…
            </button>
          </div>
        )}

        {/* Options list */}
        <div className="p-4 space-y-1">
          {SHARE_OPTIONS.map(({ id, label, icon: Icon, color, action }) => (
            <button
              key={id}
              onClick={action}
              className="w-full flex items-center gap-3 h-11 px-3 rounded-sm
                         hover:bg-zinc-800 transition-colors text-left"
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
              <span className={`font-mono text-sm ${color}`}>{label}</span>
            </button>
          ))}
        </div>

        {/* Bottom safe area spacer */}
        <div className="h-4" />
      </div>
    </>
  );
}
