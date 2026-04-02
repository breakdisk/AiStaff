"use client";
import { useState } from "react";
import { approveListing, rejectListing, type AdminListing } from "@/lib/adminApi";

export function ListingActions({ listing }: { listing: AdminListing }) {
  const [busy, setBusy] = useState(false);

  async function handle(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      window.location.reload();
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (listing.listing_status === "APPROVED") {
    return (
      <button
        disabled={busy}
        onClick={() => handle(() => rejectListing(listing.id, "Re-reviewed"))}
        className="text-[11px] px-2 py-0.5 border border-red-900 text-red-400
                   hover:bg-red-900/30 disabled:opacity-50 transition-colors"
      >
        Revoke
      </button>
    );
  }

  if (listing.listing_status === "REJECTED") {
    return (
      <button
        disabled={busy}
        onClick={() => handle(() => approveListing(listing.id))}
        className="text-[11px] px-2 py-0.5 border border-emerald-800 text-emerald-400
                   hover:bg-emerald-900/30 disabled:opacity-50 transition-colors"
      >
        Re-approve
      </button>
    );
  }

  // PENDING_REVIEW (default)
  return (
    <div className="flex gap-1">
      <button
        disabled={busy}
        onClick={() => handle(() => approveListing(listing.id))}
        className="text-[11px] px-2 py-0.5 border border-emerald-800 text-emerald-400
                   hover:bg-emerald-900/30 disabled:opacity-50 transition-colors"
      >
        Approve
      </button>
      <button
        disabled={busy}
        onClick={() => {
          const r = window.prompt("Rejection reason:");
          if (r) handle(() => rejectListing(listing.id, r));
        }}
        className="text-[11px] px-2 py-0.5 border border-red-900 text-red-400
                   hover:bg-red-900/30 disabled:opacity-50 transition-colors"
      >
        Reject
      </button>
    </div>
  );
}
