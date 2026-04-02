"use client";

import { useState, Fragment } from "react";
import { ChevronDown, ChevronUp, Loader2, Trash2 } from "lucide-react";
import {
  fetchOrgBundles, createBundle, updateBundle, deleteBundle,
  type Bundle,
} from "@/lib/enterpriseApi";
import { type AgentListing } from "@/lib/api";

function fmtUSD(cents: number) {
  return (cents / 100).toFixed(2);
}

const statusDot: Record<string, string> = {
  APPROVED:       "text-emerald-400",
  PENDING_REVIEW: "text-amber-400",
  REJECTED:       "text-red-400",
};

interface BundleEditorProps {
  orgId:          string;
  initialBundles: Bundle[];
  orgListings:    AgentListing[];
}

export function BundleEditor({ orgId, initialBundles, orgListings }: BundleEditorProps) {
  const [bundles, setBundles]         = useState<Bundle[]>(initialBundles);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [busy, setBusy]               = useState(false);
  const [draftName, setDraftName]     = useState("");
  const [draftDesc, setDraftDesc]     = useState("");
  const [draftPrice, setDraftPrice]   = useState("");
  const [draftIds, setDraftIds]       = useState<string[]>([]);
  const [isNew, setIsNew]             = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [error, setError]             = useState<string | null>(null);

  function openEditor(bundle: Bundle) {
    setExpandedId(bundle.id);
    setDraftName(bundle.name);
    setDraftDesc(bundle.description ?? "");
    setDraftPrice(fmtUSD(bundle.price_cents));
    setDraftIds(bundle.items.map((i) => i.listing_id));
    setIsNew(false);
    setDeleteConfirm("");
    setError(null);
  }

  function openNew() {
    setExpandedId("__new__");
    setDraftName(""); setDraftDesc(""); setDraftPrice(""); setDraftIds([]);
    setIsNew(true); setError(null);
  }

  function closeEditor() { setExpandedId(null); setError(null); setDeleteConfirm(""); }

  async function refresh() {
    const { bundles: fresh } = await fetchOrgBundles(orgId).catch(() => ({ bundles: [] as Bundle[] }));
    setBundles(fresh);
  }

  function parsePriceCents(): number | null {
    const val = parseFloat(draftPrice);
    if (isNaN(val) || val <= 0) return null;
    return Math.floor(val * 100);
  }

  async function handleSave() {
    const price_cents = parsePriceCents();
    if (!price_cents) { setError("Enter a valid price greater than $0.00"); return; }
    if (!draftName.trim()) { setError("Bundle name is required"); return; }
    setBusy(true); setError(null);
    try {
      if (isNew) {
        await createBundle(orgId, { name: draftName.trim(), description: draftDesc.trim() || undefined, price_cents, listing_ids: draftIds });
      } else if (expandedId) {
        await updateBundle(orgId, expandedId, { name: draftName.trim(), description: draftDesc.trim() || undefined, price_cents, listing_ids: draftIds });
      }
      await refresh(); closeEditor();
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  async function handleDelete() {
    if (deleteConfirm !== "DELETE") { setError('Type DELETE to confirm'); return; }
    if (!expandedId) return;
    setBusy(true); setError(null);
    try { await deleteBundle(orgId, expandedId); await refresh(); closeEditor(); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  function toggleListing(id: string) {
    setDraftIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-zinc-50">Bundles ({bundles.length})</h1>
        <button onClick={openNew} disabled={expandedId === "__new__"}
          className="px-3 py-1.5 border border-zinc-700 text-zinc-300 font-mono text-xs hover:border-zinc-500 hover:text-zinc-50 disabled:opacity-40 transition-colors">
          + New Bundle
        </button>
      </div>

      <div className="border border-zinc-800 rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase tracking-wider">
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Agents</th>
              <th className="text-left px-4 py-2">Price</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {expandedId === "__new__" && (
              <tr>
                <td colSpan={5} className="px-4 py-4 border-b border-zinc-800 bg-zinc-900/30">
                  <EditorRow draftName={draftName} setDraftName={setDraftName}
                    draftDesc={draftDesc} setDraftDesc={setDraftDesc}
                    draftPrice={draftPrice} setDraftPrice={setDraftPrice}
                    draftIds={draftIds} toggleListing={toggleListing}
                    orgListings={orgListings} deleteConfirm={deleteConfirm}
                    setDeleteConfirm={setDeleteConfirm} error={error} busy={busy}
                    isNew={true} onSave={handleSave} onDelete={handleDelete} onClose={closeEditor} />
                </td>
              </tr>
            )}
            {bundles.map((bundle) => (
              <Fragment key={bundle.id}>
                <tr className="border-b border-zinc-800 hover:bg-zinc-900/50 cursor-pointer"
                  onClick={() => expandedId === bundle.id ? closeEditor() : openEditor(bundle)}>
                  <td className="px-4 py-3 text-zinc-50 font-medium">{bundle.name}</td>
                  <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{bundle.item_count}</td>
                  <td className="px-4 py-3 text-amber-400 font-mono text-xs">
                    {bundle.price_cents > 0 ? `$${fmtUSD(bundle.price_cents)}/mo` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-mono text-xs ${statusDot[bundle.listing_status] ?? "text-zinc-400"}`}>
                      ● {bundle.listing_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {expandedId === bundle.id
                      ? <ChevronUp size={14} className="ml-auto text-zinc-400" />
                      : <ChevronDown size={14} className="ml-auto text-zinc-400" />}
                  </td>
                </tr>
                {expandedId === bundle.id && (
                  <tr key={`${bundle.id}-editor`} className="border-b border-zinc-800 bg-zinc-900/30">
                    <td colSpan={5} className="px-4 py-4">
                      <EditorRow draftName={draftName} setDraftName={setDraftName}
                        draftDesc={draftDesc} setDraftDesc={setDraftDesc}
                        draftPrice={draftPrice} setDraftPrice={setDraftPrice}
                        draftIds={draftIds} toggleListing={toggleListing}
                        orgListings={orgListings} deleteConfirm={deleteConfirm}
                        setDeleteConfirm={setDeleteConfirm} error={error} busy={busy}
                        isNew={false} onSave={handleSave} onDelete={handleDelete} onClose={closeEditor} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {bundles.length === 0 && expandedId !== "__new__" && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-500">
                No bundles yet. Click + New Bundle to create one.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface EditorRowProps {
  draftName: string; setDraftName: (v: string) => void;
  draftDesc: string; setDraftDesc: (v: string) => void;
  draftPrice: string; setDraftPrice: (v: string) => void;
  draftIds: string[]; toggleListing: (id: string) => void;
  orgListings: AgentListing[];
  deleteConfirm: string; setDeleteConfirm: (v: string) => void;
  error: string | null; busy: boolean; isNew: boolean;
  onSave: () => void; onDelete: () => void; onClose: () => void;
}

function EditorRow({
  draftName, setDraftName, draftDesc, setDraftDesc, draftPrice, setDraftPrice,
  draftIds, toggleListing, orgListings, deleteConfirm, setDeleteConfirm,
  error, busy, isNew, onSave, onDelete, onClose,
}: EditorRowProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 py-2">
      <div className="space-y-2">
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Select Listings</p>
        {orgListings.length === 0 ? (
          <p className="text-xs text-zinc-500">No APPROVED listings linked to this org yet.</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {orgListings.map((l) => (
              <label key={l.id} className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={draftIds.includes(l.id)}
                  onChange={() => toggleListing(l.id)} className="accent-amber-400" />
                <span className="text-xs text-zinc-300 group-hover:text-zinc-50 transition-colors truncate">{l.name}</span>
                <span className="text-xs text-zinc-500 font-mono ml-auto shrink-0">${(l.price_cents / 100).toFixed(0)}/mo</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-3">
        <div>
          <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">Bundle Name</label>
          <input value={draftName} onChange={(e) => setDraftName(e.target.value)}
            placeholder="e.g. Full Auto Stack"
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm px-3 py-2 rounded-sm focus:outline-none focus:border-amber-500 transition-colors" />
        </div>
        <div>
          <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">Description (optional)</label>
          <textarea value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} rows={2}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm px-3 py-2 rounded-sm focus:outline-none focus:border-amber-500 transition-colors resize-none" />
        </div>
        <div>
          <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">Price / month (USD)</label>
          <input value={draftPrice} onChange={(e) => setDraftPrice(e.target.value)}
            placeholder="0.00" type="number" min="0" step="0.01"
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm px-3 py-2 rounded-sm focus:outline-none focus:border-amber-500 transition-colors font-mono" />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex items-center gap-2 flex-wrap">
          <button disabled={busy} onClick={onSave}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 text-zinc-950 font-mono text-xs font-semibold rounded-sm hover:bg-amber-300 disabled:opacity-50 transition-colors">
            {busy && <Loader2 size={12} className="animate-spin" />}
            {isNew ? "Create Bundle" : "Save Changes"}
          </button>
          <button disabled={busy} onClick={onClose}
            className="px-3 py-1.5 border border-zinc-700 text-zinc-400 font-mono text-xs hover:text-zinc-200 disabled:opacity-50 transition-colors">
            Cancel
          </button>
        </div>
        {!isNew && (
          <div className="pt-2 border-t border-zinc-800 space-y-2">
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Danger Zone</p>
            <div className="flex items-center gap-2">
              <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder='Type "DELETE" to confirm'
                className="flex-1 bg-zinc-800 border border-red-900 text-zinc-50 text-xs px-3 py-1.5 rounded-sm focus:outline-none focus:border-red-500 transition-colors font-mono" />
              <button disabled={busy || deleteConfirm !== "DELETE"} onClick={onDelete}
                className="flex items-center gap-1 px-3 py-1.5 border border-red-900 text-red-400 font-mono text-xs hover:bg-red-900/30 disabled:opacity-40 transition-colors">
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
