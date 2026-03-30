import type { ReactNode } from "react";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      {children}
    </div>
  );
}
