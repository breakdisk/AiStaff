"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Scale, Check, AlertCircle, Loader2, Download, FileText } from "lucide-react";
import { downloadContractPdf } from "@/lib/download-pdf";

interface ContractPreview {
  id:            string;
  contract_type: string;
  status:        string;
  document_hash: string;
  document_text: string | null;
  party_b_email: string | null;
  created_at:    string;
}

export default function SignPage() {
  const params     = useSearchParams();
  const token      = params.get("token") ?? "";
  const contractId = (typeof window !== "undefined"
    ? window.location.pathname.split("/sign/")[1]?.split("?")[0]
    : "") ?? "";

  const [contract,    setContract]    = useState<ContractPreview | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [signerName,  setSignerName]  = useState("");
  const [signing,     setSigning]     = useState(false);
  const [signed,      setSigned]      = useState(false);
  const [signError,   setSignError]   = useState("");
  const idRef = useRef<string>("");

  useEffect(() => {
    // Extract contractId from pathname on client
    const id = window.location.pathname.split("/sign/")[1]?.split("?")[0] ?? "";
    idRef.current = id;
    if (!id || !token) { setError("Invalid link."); setLoading(false); return; }

    fetch(`/api/sign/${id}?token=${encodeURIComponent(token)}`)
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Error ${r.status}`);
        }
        return r.json() as Promise<ContractPreview>;
      })
      .then(setContract)
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load document"))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSign() {
    if (!signerName.trim()) { setSignError("Please enter your full name."); return; }
    setSigning(true);
    setSignError("");
    try {
      const res = await fetch(`/api/sign/${idRef.current}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, signer_name: signerName.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      setSigned(true);
    } catch (e) {
      setSignError(e instanceof Error ? e.message : "Signing failed");
    } finally {
      setSigning(false);
    }
  }

  // ── Loading ──
  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="flex items-center gap-2 text-zinc-500 font-mono text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading document…
      </div>
    </div>
  );

  // ── Error ──
  if (error) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="max-w-sm w-full border border-red-900 rounded-sm p-6 bg-zinc-900">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span className="font-mono text-sm text-red-400">Unable to load document</span>
        </div>
        <p className="font-mono text-xs text-zinc-500">{error}</p>
        <p className="font-mono text-xs text-zinc-600 mt-3">The link may have expired or already been used.</p>
      </div>
    </div>
  );

  // ── Signed confirmation ──
  if (signed) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="max-w-sm w-full border border-green-900 rounded-sm p-6 bg-zinc-900 text-center">
        <div className="w-10 h-10 rounded-full bg-green-900/40 border border-green-800 flex items-center justify-center mx-auto mb-4">
          <Check className="w-5 h-5 text-green-400" />
        </div>
        <h1 className="font-mono text-base font-medium text-zinc-100 mb-2">Document signed</h1>
        <p className="font-mono text-xs text-zinc-500 mb-4">
          Your signature has been recorded. Both parties will receive a confirmation email.
        </p>
        {contract && (
          <div className="border border-zinc-800 rounded-sm p-2 text-left mb-4">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Document hash (SHA-256)</p>
            <p className="font-mono text-[11px] text-zinc-400 break-all">{contract.document_hash}</p>
          </div>
        )}
        {contract?.document_text && (
          <button
            onClick={() => downloadContractPdf(contract.document_text!, contract.document_hash, contract.contract_type, contract.id)}
            className="h-8 px-3 border border-zinc-700 rounded-sm font-mono text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors flex items-center gap-1.5 mx-auto"
          >
            <Download className="w-3 h-3" /> Download PDF
          </button>
        )}
      </div>
    </div>
  );

  const alreadySigned = contract?.status === "SIGNED";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top bar */}
      <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-amber-400" />
          <span className="font-mono text-sm font-medium text-zinc-100">AiStaff Legal Toolkit</span>
        </div>
        {contract?.document_text && (
          <button
            onClick={() => downloadContractPdf(contract.document_text!, contract!.document_hash, contract!.contract_type, contract!.id)}
            className="h-7 px-2.5 border border-zinc-700 rounded-sm font-mono text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3 h-3" /> PDF
          </button>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Meta */}
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-zinc-500" />
          <span className="font-mono text-xs text-zinc-500 uppercase tracking-widest">
            {contract?.contract_type?.replace(/_/g, " ")}
          </span>
        </div>

        {/* Document */}
        <div className="border border-zinc-800 rounded-sm bg-zinc-900/40 p-5 mb-6 font-mono text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto">
          {contract?.document_text ?? "(Document content unavailable)"}
        </div>

        {/* Hash */}
        <div className="border border-zinc-800 rounded-sm p-3 mb-6">
          <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Document integrity (SHA-256)</p>
          <p className="font-mono text-[11px] text-zinc-400 break-all">{contract?.document_hash}</p>
        </div>

        {/* Sign form */}
        {alreadySigned ? (
          <div className="border border-green-900 rounded-sm p-4 flex items-center gap-3 bg-green-950/20">
            <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
            <p className="font-mono text-xs text-green-400">This document has already been signed.</p>
          </div>
        ) : (
          <div className="border border-zinc-800 rounded-sm p-4 bg-zinc-900/40">
            <p className="font-mono text-xs text-zinc-300 mb-4">
              By typing your full name and clicking <strong>Sign Document</strong>, you agree this constitutes
              your legal electronic signature on the document above.
            </p>
            <div className="mb-3">
              <label className="block font-mono text-[11px] text-zinc-400 mb-1">Full legal name</label>
              <input
                className="w-full h-9 px-3 bg-zinc-950 border border-zinc-700 rounded-sm font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                placeholder="Jane Smith"
                value={signerName}
                onChange={e => setSignerName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSign()}
              />
            </div>
            {signError && (
              <p className="font-mono text-xs text-red-400 flex items-center gap-1.5 mb-3">
                <AlertCircle className="w-3 h-3" /> {signError}
              </p>
            )}
            <button
              onClick={handleSign}
              disabled={signing || !signerName.trim()}
              className="w-full h-10 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-mono text-sm font-medium rounded-sm transition-colors flex items-center justify-center gap-2"
            >
              {signing
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing…</>
                : <><Check className="w-4 h-4" /> Sign Document</>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
