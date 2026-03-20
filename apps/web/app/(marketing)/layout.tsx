import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <nav className="border-b border-zinc-800 bg-zinc-950 px-4 py-2.5 flex items-center justify-between">
        <span className="font-mono text-xs text-zinc-500 uppercase tracking-widest">
          AiStaffApp
        </span>
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 font-mono text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft size={12} />
          Dashboard
        </Link>
      </nav>
      {children}
    </>
  );
}
