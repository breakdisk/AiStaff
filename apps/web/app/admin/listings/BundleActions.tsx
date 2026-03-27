// apps/web/app/admin/listings/BundleActions.tsx
"use client";
import { useState } from "react";
import { approveBundle, rejectBundle, type AdminBundle } from "@/lib/adminApi";

export function BundleActions({ bundle }: { bundle: AdminBundle }) {
  const [busy, setBusy] = useState(false);

  async function handle(action: () => Promise<unknown>) {
    setBusy(true);
    try { await action(); window.location.reload(); }
    catch (e) { alert(String(e)); }
    finally { setBusy(false); }
  }

  if (bundle.listing_status === "APPROVED") {
    return (
      <button disabled={busy}
        onClick={() => handle(() => rejectBundle(bundle.id, "Re-reviewed"))}
        className="text-[11px] px-2 py-0.5 border border-red-900 text-red-400 hover:bg-red-900/30 disabled:opacity-50 transition-colors">
        Revoke
      </button>
    );
  }

  if (bundle.listing_status === "REJECTED") {
    return (
      <button disabled={busy}
        onClick={() => handle(() => approveBundle(bundle.id))}
        className="text-[11px] px-2 py-0.5 border border-emerald-800 text-emerald-400 hover:bg-emerald-900/30 disabled:opacity-50 transition-colors">
        Re-approve
      </button>
    );
  }

  return (
    <div className="flex gap-1">
      <button disabled={busy}
        onClick={() => handle(() => approveBundle(bundle.id))}
        className="text-[11px] px-2 py-0.5 border border-emerald-800 text-emerald-400 hover:bg-emerald-900/30 disabled:opacity-50 transition-colors">
        Approve
      </button>
      <button disabled={busy}
        onClick={() => {
          const r = window.prompt("Rejection reason:");
          if (r) handle(() => rejectBundle(bundle.id, r));
        }}
        className="text-[11px] px-2 py-0.5 border border-red-900 text-red-400 hover:bg-red-900/30 disabled:opacity-50 transition-colors">
        Reject
      </button>
    </div>
  );
}
