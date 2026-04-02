"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { UserPlus, Copy, Check, Loader2, Mail, CheckCircle2 } from "lucide-react";
import { getMyOrg } from "@/lib/enterpriseApi";

interface ClientLink {
  id:             string;
  invited_email:  string;
  accepted_at:    string | null;
  created_at:     string;
  client_name:    string | null;
  client_email:   string | null;
  identity_tier:  string | null;
  trust_score:    number | null;
}

export default function ClientInvitePage() {
  const { data: session } = useSession();
  const profileId = (session?.user as { profileId?: string })?.profileId ?? "";

  const [orgId,      setOrgId]      = useState("");
  const [links,      setLinks]      = useState<ClientLink[]>([]);
  const [email,      setEmail]      = useState("");
  const [loading,    setLoading]    = useState(true);
  const [sending,    setSending]    = useState(false);
  const [copiedId,   setCopiedId]   = useState<string | null>(null);
  const [lastUrl,    setLastUrl]    = useState<string | null>(null);

  useEffect(() => {
    if (!profileId) return;
    getMyOrg(profileId)
      .then(org => {
        setOrgId(org.id);
        return fetch(`/api/enterprise/orgs/${org.id}/client-invite`);
      })
      .then(r => r.json())
      .then(d => setLinks(d.links ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profileId]);

  async function sendInvite() {
    if (!email || !orgId) return;
    setSending(true);
    try {
      const r = await fetch(`/api/enterprise/orgs/${orgId}/client-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await r.json();
      if (d.invite_url) {
        setLastUrl(d.invite_url);
        setEmail("");
        // Refresh list
        const listRes = await fetch(`/api/enterprise/orgs/${orgId}/client-invite`);
        const listData = await listRes.json();
        setLinks(listData.links ?? []);
      } else {
        alert(d.error ?? "Failed to send invite");
      }
    } finally { setSending(false); }
  }

  async function copyLink(url: string, id: string) {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const pending  = links.filter(l => !l.accepted_at);
  const accepted = links.filter(l => !!l.accepted_at);

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="w-4 h-4 animate-spin text-zinc-600" />
    </div>
  );

  if (!orgId) return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <p className="font-mono text-sm text-zinc-500">No organisation linked. <a href="/enterprise/setup" className="text-amber-400 underline">Set one up</a>.</p>
    </div>
  );

  return (
    <main className="flex-1 p-4 pb-20 lg:pb-4 space-y-4 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <UserPlus className="w-4 h-4 text-amber-400" />
        <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
          Client Invite
        </h1>
      </div>

      {/* Send invite */}
      <div className="border border-zinc-800 rounded-sm p-4 space-y-3">
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Invite a client</p>
        <p className="font-mono text-xs text-zinc-400">
          Send a magic link — your client clicks it, creates an account, and is automatically linked to your organisation.
        </p>
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="client@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendInvite()}
            className="flex-1 h-9 px-3 rounded-sm border border-zinc-700 bg-zinc-900
                       font-mono text-sm text-zinc-200 placeholder:text-zinc-600
                       focus:outline-none focus:border-amber-400/60 transition-colors"
          />
          <button
            disabled={sending || !email.includes("@")}
            onClick={sendInvite}
            className="flex items-center gap-1.5 px-4 h-9 rounded-sm bg-amber-400 text-zinc-900
                       font-mono text-xs font-bold uppercase tracking-widest
                       hover:bg-amber-300 transition-colors disabled:opacity-40"
          >
            {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Mail className="w-3 h-3" /> Send</>}
          </button>
        </div>

        {lastUrl && (
          <div className="flex items-center gap-2 mt-1 p-2 rounded-sm border border-emerald-900 bg-emerald-950/20">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <p className="font-mono text-[10px] text-emerald-400 flex-1 truncate">Invite sent! Link: {lastUrl}</p>
            <button
              onClick={() => copyLink(lastUrl, "last")}
              className="shrink-0 text-emerald-400 hover:text-emerald-300"
            >
              {copiedId === "last" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>

      {/* Pending invites */}
      {pending.length > 0 && (
        <div className="border border-zinc-800 rounded-sm overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-950">
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Pending ({pending.length})</p>
          </div>
          {pending.map(l => (
            <div key={l.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-zinc-800/50">
              <Mail className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
              <p className="font-mono text-xs text-zinc-400 flex-1">{l.invited_email}</p>
              <p className="font-mono text-[10px] text-zinc-600">{new Date(l.created_at).toLocaleDateString()}</p>
              <span className="font-mono text-[10px] text-amber-400 border border-amber-900 bg-amber-950/20 px-1.5 py-0.5 rounded-sm">Pending</span>
            </div>
          ))}
        </div>
      )}

      {/* Accepted clients */}
      {accepted.length > 0 && (
        <div className="border border-zinc-800 rounded-sm overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-950">
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Accepted clients ({accepted.length})</p>
          </div>
          {accepted.map(l => (
            <div key={l.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-zinc-800/50">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-xs text-zinc-200">{l.client_name ?? l.client_email ?? l.invited_email}</p>
                <p className="font-mono text-[10px] text-zinc-600">{l.client_email ?? l.invited_email}</p>
              </div>
              {l.trust_score !== null && (
                <span className="font-mono text-[10px] text-zinc-500">Trust {l.trust_score}</span>
              )}
              <span className="font-mono text-[10px] text-emerald-400 border border-emerald-900 bg-emerald-950/20 px-1.5 py-0.5 rounded-sm">Accepted</span>
            </div>
          ))}
        </div>
      )}

      {links.length === 0 && (
        <div className="border border-zinc-800 rounded-sm p-8 text-center">
          <p className="font-mono text-xs text-zinc-600">No invites sent yet. Enter a client email above to get started.</p>
        </div>
      )}
    </main>
  );
}
