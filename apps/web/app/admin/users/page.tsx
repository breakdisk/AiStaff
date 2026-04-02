import { fetchAdminUsers, type AdminUser } from "@/lib/adminApi";
import { UserActionsBar } from "./UserActionsBar";

const tierColor: Record<string, string> = {
  UNVERIFIED:         "text-zinc-500",
  SOCIAL_VERIFIED:    "text-sky-400",
  BIOMETRIC_VERIFIED: "text-emerald-400",
};

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; status?: string }>;
}) {
  const sp   = await searchParams;
  const data = await fetchAdminUsers({ role: sp.role, status: sp.status, limit: 100 })
    .catch(() => ({ users: [] as AdminUser[] }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-base font-semibold text-zinc-50">
          Users ({data.users.length})
        </h1>
        <div className="flex gap-2 text-xs flex-wrap">
          {(["", "talent", "client", "agent-owner"] as const).map((r) => (
            <a
              key={r}
              href={r ? `?role=${r}` : "?"}
              className="px-2 py-1 bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-zinc-50 transition-colors"
            >
              {r || "All"}
            </a>
          ))}
          <span className="border-l border-zinc-700 mx-1" />
          {(["", "suspended", "active"] as const).map((s) => (
            <a
              key={s}
              href={s ? `?status=${s}` : "?"}
              className="px-2 py-1 bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-zinc-50 transition-colors"
            >
              {s || "All status"}
            </a>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase tracking-wider">
              <th className="text-left px-4 py-2">User</th>
              <th className="text-left px-4 py-2">Role</th>
              <th className="text-left px-4 py-2">Tier</th>
              <th className="text-left px-4 py-2">Trust</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => (
              <tr
                key={u.id}
                className="border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors"
              >
                <td className="px-4 py-3">
                  <p className="text-zinc-50 font-medium">{u.display_name ?? "—"}</p>
                  <p className="text-zinc-500 text-xs font-mono">{u.email}</p>
                </td>
                <td className="px-4 py-3 text-zinc-400">{u.role ?? "—"}</td>
                <td
                  className={`px-4 py-3 font-mono text-xs ${tierColor[u.identity_tier] ?? "text-zinc-400"}`}
                >
                  {u.identity_tier}
                </td>
                <td className="px-4 py-3 text-zinc-400">{u.trust_score}</td>
                <td className="px-4 py-3">
                  {u.suspended_at ? (
                    <span className="text-red-400 text-xs">SUSPENDED</span>
                  ) : (
                    <span className="text-emerald-500 text-xs">ACTIVE</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <UserActionsBar user={u} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.users.length === 0 && (
          <p className="text-center text-zinc-500 text-sm py-8">No users found.</p>
        )}
      </div>
    </div>
  );
}
