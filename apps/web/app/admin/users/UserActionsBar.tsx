"use client";
import { useState } from "react";
import { suspendUser, unsuspendUser, setUserTier, type AdminUser } from "@/lib/adminApi";

export function UserActionsBar({ user }: { user: AdminUser }) {
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

  if (user.is_admin) {
    return <span className="text-amber-400 text-xs font-mono">PLATFORM ADMIN</span>;
  }

  return (
    <div className="flex gap-1 flex-wrap items-center">
      {user.suspended_at ? (
        <button
          disabled={busy}
          onClick={() => handle(() => unsuspendUser(user.id))}
          className="text-[11px] px-2 py-0.5 border border-emerald-800 text-emerald-400
                     hover:bg-emerald-900/30 disabled:opacity-50 transition-colors"
        >
          Unsuspend
        </button>
      ) : (
        <button
          disabled={busy}
          onClick={() => {
            const reason = window.prompt("Suspension reason:");
            if (reason) handle(() => suspendUser(user.id, reason));
          }}
          className="text-[11px] px-2 py-0.5 border border-red-900 text-red-400
                     hover:bg-red-900/30 disabled:opacity-50 transition-colors"
        >
          Suspend
        </button>
      )}
      <select
        disabled={busy}
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) handle(() => setUserTier(user.id, e.target.value));
        }}
        className="text-[11px] bg-zinc-800 border border-zinc-700 text-zinc-300
                   px-1 py-0.5 disabled:opacity-50"
      >
        <option value="" disabled>
          Set tier
        </option>
        <option value="UNVERIFIED">Unverified</option>
        <option value="SOCIAL_VERIFIED">Social</option>
        <option value="BIOMETRIC_VERIFIED">Biometric</option>
      </select>
    </div>
  );
}
