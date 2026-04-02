import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Package, Zap, DollarSign, LayoutDashboard, Building2, Tag } from "lucide-react";

const NAV = [
  { href: "/admin",             label: "Overview",    icon: LayoutDashboard },
  { href: "/admin/users",       label: "Users",       icon: Users           },
  { href: "/admin/listings",    label: "Listings",    icon: Package         },
  { href: "/admin/deployments", label: "Deployments", icon: Zap             },
  { href: "/admin/revenue",     label: "Revenue",     icon: DollarSign      },
  { href: "/admin/enterprise",       label: "Enterprise",  icon: Building2       },
  { href: "/admin/skill-suggestions", label: "Skill Tags",  icon: Tag             },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect("/dashboard");

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-50">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 border-r border-zinc-800 flex flex-col lg:h-screen lg:sticky lg:top-0 overflow-y-auto">
        <div className="px-4 py-4 border-b border-zinc-800">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Admin Console</p>
          <p className="text-xs text-amber-400 font-mono mt-0.5">AiStaff Platform</p>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-400
                         hover:text-zinc-50 hover:bg-zinc-800 transition-colors"
            >
              <Icon size={14} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-zinc-800">
          <p className="text-[10px] text-zinc-600 font-mono truncate">
            {session.user.email}
          </p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
