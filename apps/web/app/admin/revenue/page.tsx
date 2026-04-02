import { fetchRevenueSummary } from "@/lib/adminApi";

function fmtUSD(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function AdminRevenue() {
  const data = await fetchRevenueSummary().catch(() => null);

  return (
    <div>
      <h1 className="text-base font-semibold text-zinc-50 mb-6">Revenue</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: "Total Escrow Captured", value: data ? fmtUSD(data.total_escrow_cents) : "—" },
          { label: "Released via Payouts",  value: data ? fmtUSD(data.released_cents)      : "—" },
          { label: "Total Deployments",     value: String(data?.total_deployments ?? 0)         },
        ].map(({ label, value }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-sm p-5">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">{label}</p>
            <p className="text-2xl font-mono text-zinc-50">{value}</p>
          </div>
        ))}
      </div>

      {data && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-5">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-4">
            Escrow by Deployment State
          </p>
          <div className="space-y-2">
            {data.by_state.map((s) => (
              <div key={s.state} className="flex items-center justify-between text-sm">
                <span className="font-mono text-zinc-400">{s.state}</span>
                <div className="flex gap-8 text-right">
                  <span className="text-zinc-500 text-xs font-mono">{fmtUSD(s.escrow_cents)}</span>
                  <span className="text-zinc-50 font-mono w-8 text-right">{s.count}</span>
                </div>
              </div>
            ))}
            {data.by_state.length === 0 && (
              <p className="text-zinc-600 text-sm">No deployments yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
