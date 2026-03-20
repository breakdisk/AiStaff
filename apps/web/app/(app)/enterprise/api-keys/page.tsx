"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Shield, Plus, Trash2, Loader2, ChevronLeft, Copy } from "lucide-react";
import { getMyOrg, listApiKeys, createApiKey, revokeApiKey, ApiKey, CreatedKey } from "@/lib/enterpriseApi";

export default function EnterpriseApiKeys() {
  const { data: session } = useSession();
  const profileId = (session?.user as { profileId?: string })?.profileId;

  const [orgId, setOrgId]       = useState<string | null>(null);
  const [keys, setKeys]         = useState<ApiKey[]>([]);
  const [loading, setLoading]   = useState(true);
  const [label, setLabel]       = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey]     = useState<CreatedKey | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copied, setCopied]     = useState(false);

  async function load() {
    if (!profileId) return;
    const org = await getMyOrg(profileId).catch(() => null);
    if (!org) { setLoading(false); return; }
    setOrgId(org.id);
    const ks = await listApiKeys(org.id).catch(() => [] as ApiKey[]);
    setKeys(ks);
    setLoading(false);
  }

  useEffect(() => { load(); }, [profileId]);

  async function handleCreate() {
    if (!orgId || !profileId || !label.trim()) return;
    setCreating(true);
    try {
      const created = await createApiKey(orgId, label.trim(), profileId);
      setNewKey(created);
      setLabel("");
      const refreshed = await listApiKeys(orgId).catch(() => [] as ApiKey[]);
      setKeys(refreshed);
    } catch { /* silent */ } finally { setCreating(false); }
  }

  async function handleRevoke(kid: string) {
    if (!orgId) return;
    setRevoking(kid);
    await revokeApiKey(orgId, kid).catch(() => null);
    setKeys(k => k.filter(x => x.id !== kid));
    setRevoking(null);
  }

  function copyKey() {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey.raw_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <a href="/enterprise" className="text-zinc-500 hover:text-zinc-300"><ChevronLeft size={16} /></a>
          <Shield className="text-amber-400" size={16} />
          <h1 className="text-base font-semibold">API Keys</h1>
        </div>
        <p className="text-xs text-zinc-500">Keys grant programmatic access via the MCP server. Shown <strong className="text-zinc-300">once</strong> — store securely.</p>

        {newKey && (
          <div className="border border-emerald-800 bg-emerald-950/30 rounded-sm p-4 space-y-2">
            <p className="text-xs font-medium text-emerald-400">Key created — copy it now.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-xs text-zinc-200 bg-zinc-900 border border-zinc-700 rounded-sm px-3 py-2 break-all">{newKey.raw_key}</code>
              <button onClick={copyKey} className="flex items-center gap-1 px-3 py-2 bg-emerald-700 text-white text-xs rounded-sm hover:bg-emerald-600">
                {copied ? "Copied!" : <><Copy size={12} /> Copy</>}
              </button>
            </div>
            <button onClick={() => setNewKey(null)} className="text-xs text-zinc-500 hover:text-zinc-300">Dismiss</button>
          </div>
        )}

        <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4 space-y-3">
          <p className="text-xs font-medium text-zinc-300">Generate new API key</p>
          <div className="flex gap-2">
            <input type="text" value={label} onChange={e => setLabel(e.target.value)}
              placeholder="e.g. n8n-automation, Claude-agent"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-sm px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400"
            />
            <button onClick={handleCreate} disabled={creating || !label.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-400 text-zinc-950 text-sm font-medium rounded-sm hover:bg-amber-300 disabled:opacity-50">
              {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Generate
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-amber-400" size={20} /></div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="px-4 py-2">Label</th>
                  <th className="px-4 py-2">Key</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2">Last used</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {keys.map(k => (
                  <tr key={k.id} className="border-b border-zinc-800 last:border-0">
                    <td className="px-4 py-2.5 text-zinc-200">{k.label}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">{k.key_preview}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500">{new Date(k.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500">{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => handleRevoke(k.id)} disabled={revoking === k.id} className="text-zinc-500 hover:text-red-400">
                        {revoking === k.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    </td>
                  </tr>
                ))}
                {keys.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-zinc-500">No API keys yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
