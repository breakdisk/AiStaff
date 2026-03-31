"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { TrendingUp, DollarSign, Minus, Loader2, AlertCircle } from "lucide-react";
import { getMyOrg } from "@/lib/enterpriseApi";

interface PlMonth {
  month:                     string;
  agency_revenue_cents:      number;
  subcontractor_costs_cents: number;
  net_margin_cents:          number;
}

interface PlTotals {
  agency_revenue_cents:      number;
  subcontractor_costs_cents: number;
  net_margin_cents:          number;
}

function fmt(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function pct(part: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

function MarginBar({ margin, revenue }: { margin: number; revenue: number }) {
  const ratio = revenue === 0 ? 0 : Math.max(0, Math.min(1, margin / revenue));
  const isNeg  = margin < 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isNeg ? "bg-red-500" : "bg-emerald-500"}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span className={`font-mono text-[10px] tabular-nums w-8 text-right ${isNeg ? "text-red-400" : "text-emerald-400"}`}>
        {pct(Math.abs(margin), revenue)}
      </span>
    </div>
  );
}

function SummaryTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4 space-y-1">
      <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{label}</p>
      <p className={`font-mono text-xl font-semibold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="font-mono text-[10px] text-zinc-500">{sub}</p>}
    </div>
  );
}

export default function AgencyPLPage() {
  const { data: session } = useSession();
  const profileId = (session?.user as { profileId?: string })?.profileId;

  const [months,  setMonths]  = useState<PlMonth[]>([]);
  const [totals,  setTotals]  = useState<PlTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!profileId) return;
    getMyOrg(profileId)
      .then(org =>
        fetch(`/api/enterprise/orgs/${org.id}/pl`)
          .then(r => r.ok ? r.json() : Promise.reject(r.status))
      )
      .then(data => {
        setMonths(data.months ?? []);
        setTotals(data.totals ?? null);
      })
      .catch(() => setError("Could not load P&L data."))
      .finally(() => setLoading(false));
  }, [profileId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-amber-400" size={20} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center gap-2 text-sm text-red-400">
        <AlertCircle size={14} /> {error}
      </div>
    );
  }

  const hasData = months.length > 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <TrendingUp className="text-amber-400" size={16} />
          <h1 className="text-base font-semibold">Agency P&amp;L</h1>
          <span className="font-mono text-[10px] text-zinc-500 ml-1">Last 12 months</span>
        </div>

        {/* Summary tiles */}
        {totals && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryTile
              label="Gross Revenue"
              value={fmt(totals.agency_revenue_cents)}
              sub="Agency management fees earned"
              color="text-amber-400"
            />
            <SummaryTile
              label="Subcontractor Costs"
              value={fmt(totals.subcontractor_costs_cents)}
              sub="PAID subcontract tasks"
              color="text-red-400"
            />
            <SummaryTile
              label="Net Margin"
              value={fmt(totals.net_margin_cents)}
              sub={`${pct(Math.abs(totals.net_margin_cents), totals.agency_revenue_cents)} of revenue`}
              color={totals.net_margin_cents >= 0 ? "text-emerald-400" : "text-red-400"}
            />
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 text-[10px] text-zinc-500 font-mono">
          <span className="flex items-center gap-1"><DollarSign size={10} className="text-amber-400" /> Revenue = agency mgmt fee</span>
          <span className="flex items-center gap-1"><Minus size={10} className="text-red-400" /> Costs = paid subcontract tasks</span>
        </div>

        {/* Monthly table */}
        {hasData ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-[10px] text-zinc-500 uppercase tracking-widest">
                  <th className="px-4 py-2.5">Month</th>
                  <th className="px-4 py-2.5 text-right">Revenue</th>
                  <th className="px-4 py-2.5 text-right">Costs</th>
                  <th className="px-4 py-2.5 text-right">Net</th>
                  <th className="px-4 py-2.5 w-36">Margin</th>
                </tr>
              </thead>
              <tbody>
                {months.map(m => (
                  <tr key={m.month} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/30">
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">{m.month}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-amber-400 tabular-nums text-right">
                      {fmt(m.agency_revenue_cents)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-red-400 tabular-nums text-right">
                      {m.subcontractor_costs_cents > 0 ? fmt(m.subcontractor_costs_cents) : "—"}
                    </td>
                    <td className={`px-4 py-2.5 font-mono text-xs tabular-nums text-right ${
                      m.net_margin_cents >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {fmt(m.net_margin_cents)}
                    </td>
                    <td className="px-4 py-2.5">
                      <MarginBar margin={m.net_margin_cents} revenue={m.agency_revenue_cents} />
                    </td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="border-t border-zinc-700 bg-zinc-800/30">
                    <td className="px-4 py-2.5 font-mono text-[10px] text-zinc-400 uppercase tracking-widest">Total</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-amber-400 font-semibold tabular-nums text-right">
                      {fmt(totals.agency_revenue_cents)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-red-400 font-semibold tabular-nums text-right">
                      {totals.subcontractor_costs_cents > 0 ? fmt(totals.subcontractor_costs_cents) : "—"}
                    </td>
                    <td className={`px-4 py-2.5 font-mono text-xs font-semibold tabular-nums text-right ${
                      totals.net_margin_cents >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {fmt(totals.net_margin_cents)}
                    </td>
                    <td className="px-4 py-2.5">
                      <MarginBar margin={totals.net_margin_cents} revenue={totals.agency_revenue_cents} />
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm px-6 py-10 text-center space-y-2">
            <DollarSign className="mx-auto text-zinc-600" size={24} />
            <p className="text-sm text-zinc-400">No P&amp;L data yet.</p>
            <p className="text-xs text-zinc-600">Agency revenue appears here when deployments are released with your management fee.</p>
          </div>
        )}

        {/* How it works */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4 space-y-2">
          <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest">How it works</p>
          <ul className="space-y-1 text-[11px] text-zinc-500 leading-relaxed list-none">
            <li><span className="text-amber-400 font-mono">Revenue</span> — your agency management fee, collected when escrow is released on a deployment tied to your org.</li>
            <li><span className="text-red-400 font-mono">Costs</span> — budget paid to subcontractors you assigned via the Subcontracts board (status = PAID).</li>
            <li><span className="text-emerald-400 font-mono">Net margin</span> — Revenue minus Costs. The platform's 12% fee is already excluded from your revenue figure.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
