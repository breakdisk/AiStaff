import { fetchAdminDeployments, type AdminDeployment } from "@/lib/adminApi";

function fmtUSD(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const stateColor: Record<string, string> = {
  RELEASED:          "text-emerald-400",
  VETOED:            "text-red-400",
  FAILED:            "text-red-500",
  VETO_WINDOW:       "text-amber-400",
  BIOMETRIC_PENDING: "text-sky-400",
  PENDING:           "text-zinc-400",
  PROVISIONING:      "text-zinc-300",
};

const STATES = [
  "",
  "PENDING",
  "PROVISIONING",
  "VETO_WINDOW",
  "BIOMETRIC_PENDING",
  "RELEASED",
  "VETOED",
  "FAILED",
];

export default async function AdminDeployments({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const sp   = await searchParams;
  const data = await fetchAdminDeployments(sp.state)
    .catch(() => ({ deployments: [] as AdminDeployment[] }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-base font-semibold text-zinc-50">
          Deployments ({data.deployments.length})
        </h1>
        <div className="flex gap-2 text-xs flex-wrap">
          {STATES.map((s) => (
            <a
              key={s}
              href={s ? `?state=${s}` : "?"}
              className="px-2 py-1 bg-zinc-800 border border-zinc-700 text-zinc-300
                         hover:text-zinc-50 transition-colors"
            >
              {s || "All"}
            </a>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase tracking-wider">
              <th className="text-left px-4 py-2">ID</th>
              <th className="text-left px-4 py-2">Escrow</th>
              <th className="text-left px-4 py-2">State</th>
              <th className="text-left px-4 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {data.deployments.map((d) => (
              <tr
                key={d.id}
                className="border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors"
              >
                <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                  {d.id.slice(0, 8)}…
                </td>
                <td className="px-4 py-3 text-zinc-300 font-mono">
                  {fmtUSD(d.escrow_amount_cents)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs font-mono ${stateColor[d.state] ?? "text-zinc-400"}`}
                  >
                    {d.state}
                  </span>
                  {d.failure_reason && (
                    <p className="text-xs text-zinc-600 mt-0.5">{d.failure_reason}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-500 text-xs">
                  {new Date(d.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.deployments.length === 0 && (
          <p className="text-center text-zinc-500 text-sm py-8">No deployments found.</p>
        )}
      </div>
    </div>
  );
}
