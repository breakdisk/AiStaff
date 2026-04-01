"use client";
import { useEffect, useState } from "react";
import { Shield, Plus, X } from "lucide-react";

interface WarrantyClaim {
  id: string;
  deployment_id: string;
  drift_proof: string;
  claimed_at: string;
  resolved_at: string | null;
  resolution: "REMEDIATED" | "REFUNDED" | "REJECTED" | null;
  listing_name: string;
}

function ResolutionBadge({ resolution }: { resolution: WarrantyClaim["resolution"] }) {
  if (!resolution) {
    return (
      <span className="rounded-sm border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-400">
        PENDING
      </span>
    );
  }
  const cls =
    resolution === "REMEDIATED" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" :
    resolution === "REFUNDED"   ? "border-blue-500/30 bg-blue-500/10 text-blue-400" :
                                  "border-red-500/30 bg-red-500/10 text-red-500";
  return (
    <span className={`rounded-sm border px-1.5 py-0.5 font-mono text-[10px] ${cls}`}>
      {resolution}
    </span>
  );
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function WarrantyPage() {
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deploymentId, setDeploymentId] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/warranty-claims")
      .then((r) => r.json() as Promise<WarrantyClaim[]>)
      .then(setClaims)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    setFormError(null);
    if (!deploymentId.trim() || !description.trim()) {
      setFormError("Both fields are required.");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/warranty-claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deployment_id: deploymentId.trim(), description: description.trim() }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json() as { error?: string };
      setFormError(data.error ?? "Failed to submit claim.");
      return;
    }
    setShowForm(false);
    setDeploymentId("");
    setDescription("");
    load();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-amber-400" />
            <h1 className="text-lg font-mono font-semibold text-zinc-50">Warranty Claims</h1>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-400 text-zinc-950 font-mono text-xs font-semibold rounded-sm hover:bg-amber-300 transition-colors"
          >
            {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showForm ? "Cancel" : "File a Claim"}
          </button>
        </div>

        {/* Inline claim form */}
        {showForm && (
          <div className="mb-6 rounded-sm border border-zinc-700 bg-zinc-900 p-4 space-y-3">
            <p className="font-mono text-xs text-zinc-400">
              Claims can be filed within 7 days of deployment completion. Paste your deployment ID from{" "}
              <a href="/engagements" className="text-amber-400 hover:underline">/engagements</a>.
            </p>
            <div className="space-y-1">
              <label className="font-mono text-xs text-zinc-400">Deployment ID</label>
              <input
                value={deploymentId}
                onChange={(e) => setDeploymentId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full rounded-sm border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-50 placeholder-zinc-600 focus:border-amber-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-zinc-400">Description of issue</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Describe the drift or defect you observed..."
                className="w-full rounded-sm border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-50 placeholder-zinc-600 focus:border-amber-400 focus:outline-none resize-none"
              />
            </div>
            {formError && <p className="font-mono text-xs text-red-500">{formError}</p>}
            <button
              onClick={submit}
              disabled={submitting}
              className="px-4 py-2 bg-amber-400 text-zinc-950 font-mono text-xs font-semibold rounded-sm hover:bg-amber-300 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Submitting…" : "Submit Claim"}
            </button>
          </div>
        )}

        {/* Claims list */}
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse rounded-sm border border-zinc-800 bg-zinc-900 p-4 space-y-2">
                <div className="h-4 w-1/2 rounded bg-zinc-800" />
                <div className="h-3 w-1/3 rounded bg-zinc-800" />
              </div>
            ))}
          </div>
        ) : claims.length === 0 ? (
          <div className="rounded-sm border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="font-mono text-sm text-zinc-400">
              No warranty claims filed. Claims can be filed within 7 days of deployment completion.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-sm border border-zinc-800 overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-zinc-900">
                  <tr>
                    {["Agent", "Filed", "Description", "Status"].map((h) => (
                      <th key={h} className="px-4 py-2.5 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {claims.map((c, i) => (
                    <tr key={c.id} className={i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/50"}>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-200">{c.listing_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-400">{relativeTime(c.claimed_at)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-400 max-w-xs truncate">{c.drift_proof}</td>
                      <td className="px-4 py-3"><ResolutionBadge resolution={c.resolution} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {claims.map((c) => (
                <div key={c.id} className="rounded-sm border border-zinc-800 bg-zinc-900 p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-sm font-medium text-zinc-50">{c.listing_name}</p>
                    <ResolutionBadge resolution={c.resolution} />
                  </div>
                  <p className="font-mono text-xs text-zinc-400 line-clamp-2">{c.drift_proof}</p>
                  <p className="font-mono text-[10px] text-zinc-600">{relativeTime(c.claimed_at)}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
