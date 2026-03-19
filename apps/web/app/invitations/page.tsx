"use client";

import { useEffect, useState } from "react";
import { Mail, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { AppSidebar, AppMobileNav } from "@/components/AppSidebar";
import {
  fetchReceivedInvitations, respondToInvitation,
  type ReceivedInvitation,
} from "@/lib/api";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function StatusBadge({ status }: { status: ReceivedInvitation["status"] }) {
  if (status === "ACCEPTED") {
    return (
      <span className="flex items-center gap-1 font-mono text-[10px] text-green-400 border border-green-900 px-1.5 py-0.5 rounded-sm">
        <CheckCircle2 className="w-2.5 h-2.5" />ACCEPTED
      </span>
    );
  }
  if (status === "DECLINED") {
    return (
      <span className="flex items-center gap-1 font-mono text-[10px] text-red-400 border border-red-900 px-1.5 py-0.5 rounded-sm">
        <XCircle className="w-2.5 h-2.5" />DECLINED
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 font-mono text-[10px] text-amber-400 border border-amber-900 px-1.5 py-0.5 rounded-sm">
      <Clock className="w-2.5 h-2.5" />PENDING
    </span>
  );
}

function InvitationCard({ inv, onRespond }: {
  inv:       ReceivedInvitation;
  onRespond: (id: string, action: "accept" | "decline") => Promise<void>;
}) {
  const [acting, setActing] = useState<"accept" | "decline" | null>(null);

  async function handle(action: "accept" | "decline") {
    setActing(action);
    try {
      await onRespond(inv.id, action);
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900/50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="font-mono text-xs font-medium text-zinc-100">
            {inv.client_name || "A client"}
          </p>
          {inv.listing_title && (
            <p className="font-mono text-[10px] text-zinc-500">
              Re: {inv.listing_title}
            </p>
          )}
          <p className="font-mono text-[10px] text-zinc-600">{fmtDate(inv.created_at)}</p>
        </div>
        <StatusBadge status={inv.status} />
      </div>

      {inv.message && (
        <p className="font-mono text-xs text-zinc-400 leading-relaxed border-l-2 border-zinc-700 pl-3">
          {inv.message}
        </p>
      )}

      {inv.status === "PENDING" && (
        <div className="flex gap-2 pt-1">
          <button
            disabled={acting !== null}
            onClick={() => handle("accept")}
            className="flex-1 h-9 rounded-sm border border-green-800 bg-green-950/30 text-green-400
                       font-mono text-xs uppercase tracking-widest hover:border-green-600 transition-colors
                       flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {acting === "accept" && <Loader2 className="w-3 h-3 animate-spin" />}
            Accept
          </button>
          <button
            disabled={acting !== null}
            onClick={() => handle("decline")}
            className="flex-1 h-9 rounded-sm border border-zinc-700 text-zinc-400
                       font-mono text-xs uppercase tracking-widest hover:border-zinc-600 hover:text-zinc-300
                       transition-colors flex items-center justify-center gap-1.5
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {acting === "decline" && <Loader2 className="w-3 h-3 animate-spin" />}
            Decline
          </button>
        </div>
      )}

      {inv.responded_at && (
        <p className="font-mono text-[10px] text-zinc-700">
          Responded {fmtDate(inv.responded_at)}
        </p>
      )}
    </div>
  );
}

export default function InvitationsPage() {
  const [invitations, setInvitations] = useState<ReceivedInvitation[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    fetchReceivedInvitations()
      .then((r) => setInvitations(r.invitations))
      .catch(() => setError("Could not load invitations"))
      .finally(() => setLoading(false));
  }, []);

  async function handleRespond(id: string, action: "accept" | "decline") {
    await respondToInvitation(id, action);
    setInvitations((prev) =>
      prev.map((inv) =>
        inv.id === id
          ? { ...inv, status: action === "accept" ? "ACCEPTED" : "DECLINED", responded_at: new Date().toISOString() }
          : inv,
      ),
    );
  }

  const pending  = invitations.filter((i) => i.status === "PENDING");
  const resolved = invitations.filter((i) => i.status !== "PENDING");

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <AppSidebar />

      <main className="flex-1 p-4 pb-20 lg:pb-4 space-y-4 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <Mail className="w-4 h-4 text-amber-400" />
          <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
            Project Invitations
          </h1>
          {pending.length > 0 && (
            <span className="ml-auto font-mono text-xs bg-amber-950 border border-amber-800 text-amber-400 px-2 py-0.5 rounded-sm">
              {pending.length} pending
            </span>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
          </div>
        )}

        {error && (
          <p className="font-mono text-xs text-red-400">{error}</p>
        )}

        {!loading && !error && invitations.length === 0 && (
          <div className="border border-zinc-800 rounded-sm p-8 text-center">
            <Mail className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
            <p className="font-mono text-xs text-zinc-500">No invitations yet.</p>
            <p className="font-mono text-[10px] text-zinc-700 mt-1">
              Clients can invite you to projects from the Matching and Outcomes pages.
            </p>
          </div>
        )}

        {pending.length > 0 && (
          <div className="space-y-3">
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Pending</p>
            {pending.map((inv) => (
              <InvitationCard key={inv.id} inv={inv} onRespond={handleRespond} />
            ))}
          </div>
        )}

        {resolved.length > 0 && (
          <div className="space-y-3">
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Resolved</p>
            {resolved.map((inv) => (
              <InvitationCard key={inv.id} inv={inv} onRespond={handleRespond} />
            ))}
          </div>
        )}
      </main>

      <AppMobileNav />
    </div>
  );
}
