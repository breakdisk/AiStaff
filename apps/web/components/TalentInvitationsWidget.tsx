"use client";

import { useState, useEffect } from "react";
import { Loader2, Mail } from "lucide-react";
import {
  fetchReceivedInvitations,
  respondToInvitation,
  type ReceivedInvitation,
} from "@/lib/api";

export default function TalentInvitationsWidget() {
  const [invitations, setInvitations] = useState<ReceivedInvitation[] | null>(null);
  const [responding, setResponding] = useState<string | null>(null);

  useEffect(() => {
    fetchReceivedInvitations()
      .then(data => setInvitations(data.invitations))
      .catch(() => setInvitations([]));
  }, []);

  const pending = (invitations ?? []).filter(i => i.status === "PENDING");

  async function handleRespond(id: string, action: "accept" | "decline") {
    setResponding(id);
    try {
      await respondToInvitation(id, action);
      setInvitations(prev =>
        (prev ?? []).filter(inv => inv.id !== id)
      );
    } catch {
      // keep the card on error
    } finally {
      setResponding(null);
    }
  }

  // Loading state
  if (invitations === null) {
    return (
      <div className="border border-zinc-800 rounded-sm overflow-hidden space-y-px">
        {[0, 1].map(i => (
          <div key={i} className="h-12 bg-zinc-800 animate-pulse" />
        ))}
      </div>
    );
  }

  // Empty state
  if (pending.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-sm px-3 py-2.5 flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-xs text-zinc-500">
          <Mail size={12} />
          No new invitations
        </span>
        <a href="/invitations" className="font-mono text-[10px] text-amber-600 hover:text-amber-400">
          View all →
        </a>
      </div>
    );
  }

  const first = pending[0];
  const rest = pending.length - 1;
  const rawMessage = first.message ?? "";
  const previewText = rawMessage.length > 120
    ? rawMessage.slice(0, 120) + "…"
    : rawMessage;

  return (
    <div className="rounded-sm overflow-hidden border border-amber-800">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#1c0a00]">
        <span className="font-mono text-xs text-amber-400 flex items-center gap-2">
          <Mail size={12} />
          PENDING INVITATIONS
        </span>
        <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm bg-amber-900/60 text-amber-300">
          {pending.length} new
        </span>
      </div>

      {/* First card */}
      <div className="px-3 py-2.5 bg-zinc-950 border-t border-amber-900/50">
        <p className="font-mono text-xs text-zinc-100 font-semibold">
          {first.client_name}
        </p>
        {first.listing_title && (
          <p className="font-mono text-[10px] text-zinc-500 mt-0.5">
            {first.listing_title}
          </p>
        )}
        {previewText && (
          <p className="font-mono text-[10px] text-zinc-500 mt-0.5 leading-relaxed">
            &ldquo;{previewText}&rdquo;
          </p>
        )}
        <div className="flex gap-2 mt-2.5">
          <button
            onClick={() => handleRespond(first.id, "accept")}
            disabled={responding === first.id}
            className="flex-1 flex items-center justify-center gap-1.5 h-7 font-mono text-[10px] rounded-sm bg-emerald-950 border border-emerald-800 text-emerald-400 hover:border-emerald-600 disabled:opacity-50 transition-colors"
          >
            {responding === first.id
              ? <Loader2 size={10} className="animate-spin" />
              : "Accept"}
          </button>
          <button
            onClick={() => handleRespond(first.id, "decline")}
            disabled={responding === first.id}
            className="flex-1 flex items-center justify-center gap-1.5 h-7 font-mono text-[10px] rounded-sm bg-zinc-900 border border-zinc-700 text-zinc-400 hover:border-zinc-500 disabled:opacity-50 transition-colors"
          >
            {responding === first.id
              ? <Loader2 size={10} className="animate-spin" />
              : "Decline"}
          </button>
        </div>
        {rest > 0 && (
          <p className="font-mono text-[9px] text-zinc-600 mt-2">+{rest} more</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-zinc-950 border-t border-zinc-800">
        <a href="/invitations" className="font-mono text-[10px] text-amber-600 hover:text-amber-400">
          View all invitations →
        </a>
      </div>
    </div>
  );
}
