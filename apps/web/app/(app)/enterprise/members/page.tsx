"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Users, UserMinus, Mail, Loader2, ChevronLeft, RefreshCw } from "lucide-react";
import { getMyOrg, listMembers, inviteMember, removeMember, OrgMember } from "@/lib/enterpriseApi";

export default function EnterpriseMembers() {
  const { data: session } = useSession();
  const profileId = (session?.user as { profileId?: string })?.profileId;

  const [orgId, setOrgId]           = useState<string | null>(null);
  const [members, setMembers]       = useState<OrgMember[]>([]);
  const [loading, setLoading]       = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting]     = useState(false);
  const [inviteMsg, setInviteMsg]   = useState<string | null>(null);
  const [removing, setRemoving]     = useState<string | null>(null);

  async function load() {
    if (!profileId) return;
    const org = await getMyOrg(profileId).catch(() => null);
    if (!org) { setLoading(false); return; }
    setOrgId(org.id);
    const mems = await listMembers(org.id).catch(() => [] as OrgMember[]);
    setMembers(mems);
    setLoading(false);
  }

  useEffect(() => { load(); }, [profileId]);

  async function handleInvite() {
    if (!orgId || !profileId || !inviteEmail.trim()) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      await inviteMember(orgId, inviteEmail.trim(), profileId);
      setInviteMsg(`Invite sent to ${inviteEmail.trim()}`);
      setInviteEmail("");
    } catch {
      setInviteMsg("Failed to send invite.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(pid: string) {
    if (!orgId) return;
    setRemoving(pid);
    await removeMember(orgId, pid).catch(() => null);
    setMembers(m => m.filter(x => x.profile_id !== pid));
    setRemoving(null);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <a href="/enterprise" className="text-zinc-500 hover:text-zinc-300"><ChevronLeft size={16} /></a>
          <Users className="text-amber-400" size={16} />
          <h1 className="text-base font-semibold">Team Members</h1>
          <button
            onClick={load}
            className="ml-auto text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Refresh member list"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4 space-y-3">
          <p className="text-xs font-medium text-zinc-300">Invite a new member</p>
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-sm px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400"
            />
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-400 text-zinc-950 text-sm font-medium rounded-sm hover:bg-amber-300 disabled:opacity-50"
            >
              {inviting ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} Invite
            </button>
          </div>
          {inviteMsg && (
            <p className={`text-xs ${inviteMsg.startsWith("Failed") ? "text-red-400" : "text-emerald-400"}`}>{inviteMsg}</p>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-amber-400" size={20} /></div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="px-4 py-2">Member</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Tier</th>
                  <th className="px-4 py-2">Trust</th>
                  <th className="px-4 py-2">Joined</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.profile_id} className="border-b border-zinc-800 last:border-0">
                    <td className="px-4 py-2.5">
                      <p className="text-zinc-200">{m.display_name}</p>
                      <p className="text-[10px] text-zinc-500">{m.email}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded-sm border ${
                        m.member_role === "ADMIN" ? "border-amber-700 text-amber-400" : "border-zinc-700 text-zinc-400"
                      }`}>{m.member_role}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[10px]">
                      <span className={
                        m.identity_tier === "BIOMETRIC_VERIFIED" ? "text-emerald-400" :
                        m.identity_tier === "SOCIAL_VERIFIED"    ? "text-sky-400" : "text-zinc-500"
                      }>
                        {m.identity_tier === "BIOMETRIC_VERIFIED" ? "T2" : m.identity_tier === "SOCIAL_VERIFIED" ? "T1" : "T0"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">{m.trust_score}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500">{new Date(m.joined_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5">
                      {m.member_role !== "ADMIN" && (
                        <button onClick={() => handleRemove(m.profile_id)} disabled={removing === m.profile_id}
                          className="text-zinc-500 hover:text-red-400">
                          {removing === m.profile_id ? <Loader2 size={12} className="animate-spin" /> : <UserMinus size={12} />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-zinc-500">No members yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
