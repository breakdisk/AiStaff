import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { adminListOrgs, AdminOrgRow } from "@/lib/enterpriseApi";
import { Building2 } from "lucide-react";
import { VerifyOrgActions } from "./VerifyOrgActions";

const tierColor: Record<string, string> = {
  PLATINUM:   "text-violet-400",
  ENTERPRISE: "text-amber-400",
  GROWTH:     "text-zinc-400",
};

export default async function AdminEnterprise() {
  const session = await auth();
  const user = session?.user as { isAdmin?: boolean } | undefined;
  if (!user?.isAdmin) redirect("/dashboard");

  const orgs: AdminOrgRow[] = await adminListOrgs().catch(() => []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Building2 size={16} className="text-amber-400" />
        <h1 className="text-base font-semibold text-zinc-50">
          Enterprise Orgs ({orgs.length})
        </h1>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
              <th className="px-4 py-2">Organisation</th>
              <th className="px-4 py-2">Owner</th>
              <th className="px-4 py-2">Tier</th>
              <th className="px-4 py-2">Members</th>
              <th className="px-4 py-2">Contract</th>
              <th className="px-4 py-2">Renewal</th>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2">Verified</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/40">
                <td className="px-4 py-2.5 font-medium text-zinc-200">{org.name}</td>
                <td className="px-4 py-2.5 text-xs text-zinc-400">{org.owner_email}</td>
                <td className="px-4 py-2.5">
                  <span className={`font-mono text-[10px] ${tierColor[org.plan_tier] ?? "text-zinc-400"}`}>
                    {org.plan_tier}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-zinc-300">{org.member_count}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">
                  {org.contract_value_cents > 0
                    ? `$${(org.contract_value_cents / 100).toLocaleString()}`
                    : "—"}
                </td>
                <td className="px-4 py-2.5 text-xs text-zinc-500">{org.renewal_date ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-zinc-500">
                  {new Date(org.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-2.5">
                  <VerifyOrgActions orgId={org.id} verified={org.is_verified ?? false} />
                </td>
              </tr>
            ))}
            {orgs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-xs text-zinc-500">
                  No enterprise organisations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
