"use client";

import { useState } from "react";
import { ShieldCheck, Shield } from "lucide-react";

interface Props {
  orgId:      string;
  verified:   boolean;
}

export function VerifyOrgActions({ orgId, verified: initial }: Props) {
  const [verified, setVerified] = useState(initial);
  const [loading,  setLoading]  = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/enterprises/${orgId}/verify`, { method: "PATCH" });
      if (r.ok) {
        const data = await r.json();
        setVerified(data.is_verified);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={verified ? "Revoke verified status" : "Grant verified badge"}
      className={`flex items-center gap-1 px-2 py-1 rounded-sm font-mono text-[10px] border transition-colors disabled:opacity-50 ${
        verified
          ? "border-emerald-800 text-emerald-400 bg-emerald-950/30 hover:bg-emerald-950/60"
          : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
      }`}
    >
      {verified ? <ShieldCheck size={11} /> : <Shield size={11} />}
      {loading ? "…" : verified ? "Verified" : "Verify"}
    </button>
  );
}
