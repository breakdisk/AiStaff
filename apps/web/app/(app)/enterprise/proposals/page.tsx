"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  getMyOrg,
  fetchOrgProposals,
  type OrgProposalItem,
  type OrgProposalsResponse,
} from "@/lib/enterpriseApi";

function ProposalCard({ item }: { item: OrgProposalItem }) {
  const router = useRouter();
  const date = new Date(item.submitted_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });

  return (
    <button
      onClick={() => router.push(`/proposals/${item.id}`)}
      className="w-full text-left border border-zinc-800 bg-zinc-900 rounded-sm p-3 space-y-1.5 hover:border-zinc-600 transition-colors"
    >
      <p className="text-xs font-medium text-zinc-50 line-clamp-1">{item.job_title}</p>
      <div className="flex items-center gap-1 text-[11px] text-zinc-500">
        <span className="font-mono truncate max-w-[120px]">
          {item.submitter_name ?? item.freelancer_email.split("@")[0]}
        </span>
        <span>·</span>
        <span className="font-mono">{date}</span>
      </div>
      <p className="font-mono text-[10px] text-zinc-600 truncate">{item.client_email}</p>
    </button>
  );
}

function KanbanColumn({ title, items }: { title: string; items: OrgProposalItem[] }) {
  return (
    <div className="flex-1 min-w-0 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{title}</p>
        <span className="font-mono text-[10px] text-zinc-600">{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.map((item) => <ProposalCard key={item.id} item={item} />)}
        {items.length === 0 && <p className="text-xs text-zinc-600 italic">None</p>}
      </div>
    </div>
  );
}

export default function ProposalsInboxPage() {
  const { data: session } = useSession();
  const [data, setData]       = useState<OrgProposalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [orgId, setOrgId]     = useState<string | null>(null);
  const [view, setView]       = useState<"mine" | "all">("all");

  const user        = session?.user as { profileId?: string; role?: string; isAdmin?: boolean } | undefined;
  const profileId   = user?.profileId ?? "";
  const isAdmin     = user?.isAdmin === true || user?.role === "agent-owner" || user?.role === "admin";

  // Resolve orgId via getMyOrg since it's not stored on the session token
  useEffect(() => {
    if (!profileId) return;
    getMyOrg(profileId)
      .then((org) => setOrgId(org.id))
      .catch(() => {
        setError("No organisation linked to this account.");
        setLoading(false);
      });
  }, [profileId]);

  useEffect(() => {
    if (!orgId || !profileId) return;
    setLoading(true);
    fetchOrgProposals(orgId, profileId)
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [orgId, profileId]);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 size={18} className="animate-spin text-zinc-500" />
    </div>
  );

  if (error) return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <p className="text-sm text-red-400">{error}</p>
    </div>
  );

  if (!data) return null;

  const filtered: OrgProposalsResponse = view === "mine"
    ? {
        draft:  data.draft.filter( (p) => p.submitted_by_profile_id === profileId),
        sent:   data.sent.filter(  (p) => p.submitted_by_profile_id === profileId),
        closed: data.closed.filter((p) => p.submitted_by_profile_id === profileId),
      }
    : data;

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-zinc-50">Proposal Inbox</h1>
        {isAdmin && (
          <div className="flex items-center gap-1 border border-zinc-800 rounded-sm overflow-hidden">
            {(["mine", "all"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest transition-colors ${
                  view === v ? "bg-zinc-800 text-zinc-50" : "text-zinc-500 hover:text-zinc-300"
                }`}>
                {v}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KanbanColumn title="Draft"  items={filtered.draft}  />
        <KanbanColumn title="Sent"   items={filtered.sent}   />
        <KanbanColumn title="Closed" items={filtered.closed} />
      </div>
    </div>
  );
}
