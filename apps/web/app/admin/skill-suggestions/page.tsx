import { adminPool } from "@/lib/admin";
import { SkillSuggestionActions } from "./SkillSuggestionActions";

export const runtime = "nodejs";

type Suggestion = {
  id: string;
  tag: string;
  domain: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  suggested_by_email: string;
};

const statusColor: Record<string, string> = {
  pending:  "text-amber-400",
  approved: "text-emerald-400",
  rejected: "text-red-400",
};

export default async function AdminSkillSuggestions({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp     = await searchParams;
  const filter = sp.status ?? "pending";

  let rows: Suggestion[] = [];
  let client;
  try {
    client = await adminPool.connect();
    const result = await client.query(
      `SELECT ss.id, ss.tag, ss.domain, ss.status,
              ss.created_at, ss.reviewed_at,
              COALESCE(up.email, 'unknown') AS suggested_by_email
       FROM skill_suggestions ss
       LEFT JOIN unified_profiles up ON up.id = ss.suggested_by
       ${filter !== "all" ? "WHERE ss.status = $1" : ""}
       ORDER BY ss.created_at DESC
       LIMIT 200`,
      filter !== "all" ? [filter] : [],
    );
    rows = result.rows as Suggestion[];
  } catch {
    rows = [];
  } finally {
    client?.release();
  }

  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-base font-semibold text-zinc-50">
          Skill Suggestions{filter === "pending" && pendingCount > 0 && (
            <span className="ml-2 text-xs font-mono text-amber-400">
              {pendingCount} pending
            </span>
          )}
        </h1>
        <div className="flex gap-2 text-xs">
          {(["pending", "approved", "rejected", "all"] as const).map((v) => (
            <a
              key={v}
              href={`?status=${v}`}
              className={`px-2 py-1 border transition-colors
                ${filter === v
                  ? "border-amber-400/60 bg-amber-400/10 text-amber-400"
                  : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:text-zinc-50"}`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </a>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-8 text-center">
          <p className="font-mono text-xs text-zinc-500">
            No {filter !== "all" ? filter : ""} suggestions.
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase tracking-wider">
                <th className="text-left px-4 py-2">Tag</th>
                <th className="text-left px-4 py-2">Domain</th>
                <th className="text-left px-4 py-2">Submitted by</th>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-zinc-100 text-xs">{s.tag}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-zinc-400 text-xs">{s.domain}</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{s.suggested_by_email}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs font-mono">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-mono ${statusColor[s.status] ?? "text-zinc-400"}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <SkillSuggestionActions suggestion={s} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
