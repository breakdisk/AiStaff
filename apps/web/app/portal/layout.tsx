import type { ReactNode } from "react";
import { Providers } from "@/app/providers";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <div className="min-h-screen bg-zinc-950 text-zinc-50">
        {children}
      </div>
    </Providers>
  );
}
