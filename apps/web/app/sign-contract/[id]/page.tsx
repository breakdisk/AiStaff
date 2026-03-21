"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { FileSignature, ShieldCheck, AlertTriangle, Loader2, CheckCircle } from "lucide-react";

interface ContractPreview {
  id:             string;
  contract_type:  string;
  status:         string;
  document_hash:  string;
  document_text:  string | null;
  party_b_email:  string | null;
  created_at:     string;
}

export default function SignContractPage() {
  const { id }         = useParams<{ id: string }>();
  const searchParams   = useSearchParams();
  const token          = searchParams.get("token") ?? "";

  const [preview,   setPreview]   = useState<ContractPreview | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [name,      setName]      = useState("");
  const [signing,   setSigning]   = useState(false);
  const [signed,    setSigned]    = useState(false);

  useEffect(() => {
    if (!id || !token) {
      setError("Invalid or missing signature link.");
      setLoading(false);
      return;
    }
    fetch(`/api/compliance/contracts/${id}/preview?token=${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json() as Promise<ContractPreview>;
      })
      .then((data) => setPreview(data))
      .catch(() => setError("This signature link is invalid or has expired."))
      .finally(() => setLoading(false));
  }, [id, token]);

  async function handleSign() {
    if (!name.trim()) return;
    setSigning(true);
    try {
      // Use /api/contract-sign which records signature AND notifies Party A
      const res = await fetch("/api/contract-sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contract_id: id, token, signer_name: name.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSigned(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sign. Please try again.");
    } finally {
      setSigning(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
      </div>
    );
  }

  if (error && !signed) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full border border-red-900 rounded-sm p-6 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="font-mono text-sm text-red-400">Invalid Link</span>
          </div>
          <p className="font-mono text-xs text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full border border-emerald-900 rounded-sm p-6 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="font-mono text-sm text-emerald-400">Contract Signed</span>
          </div>
          <p className="font-mono text-xs text-zinc-400">
            Thank you. Your signature has been recorded and both parties will receive a confirmation.
          </p>
          <p className="font-mono text-[10px] text-zinc-600">
            Document hash: {preview?.document_hash}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-4">

        {/* Header */}
        <div className="flex items-center gap-2">
          <FileSignature className="w-4 h-4 text-amber-400" />
          <span className="font-mono text-sm text-zinc-300 uppercase tracking-widest">
            Review & Sign
          </span>
        </div>

        {/* Contract meta */}
        <div className="border border-zinc-800 rounded-sm p-3 flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="font-mono text-xs text-zinc-300 capitalize">
              {preview?.contract_type?.replace(/_/g, " ")}
            </p>
            <p className="font-mono text-[10px] text-zinc-500">
              Created {preview?.created_at ? new Date(preview.created_at).toLocaleDateString() : "—"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span className="font-mono text-[10px] text-zinc-500">SHA-256 verified</span>
          </div>
        </div>

        {/* Document text */}
        {preview?.document_text && (
          <div className="border border-zinc-800 rounded-sm p-4 max-h-96 overflow-y-auto">
            <pre className="font-mono text-[11px] text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {preview.document_text}
            </pre>
          </div>
        )}

        {/* Hash */}
        <p className="font-mono text-[10px] text-zinc-600 break-all">
          Hash: {preview?.document_hash}
        </p>

        {/* Sign form */}
        <div className="border border-zinc-800 rounded-sm p-4 space-y-3">
          <p className="font-mono text-xs text-zinc-400">
            By signing, you confirm you have read and agree to the terms above.
          </p>
          <div>
            <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">
              Your full name
            </label>
            <input
              className="w-full bg-zinc-900 border border-zinc-700 rounded-sm px-2.5 py-1.5
                         font-mono text-xs text-zinc-200 focus:outline-none focus:border-amber-700
                         placeholder-zinc-700"
              placeholder="Jane Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSign()}
            />
          </div>
          {error && <p className="font-mono text-[10px] text-red-400">{error}</p>}
          <button
            onClick={handleSign}
            disabled={signing || !name.trim()}
            className="w-full h-9 rounded-sm bg-amber-950 border border-amber-800 text-amber-400
                       font-mono text-xs hover:bg-amber-900 transition-colors disabled:opacity-50
                       flex items-center justify-center gap-2"
          >
            {signing
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <><FileSignature className="w-3.5 h-3.5" /> Sign Contract</>
            }
          </button>
        </div>

      </div>
    </div>
  );
}
