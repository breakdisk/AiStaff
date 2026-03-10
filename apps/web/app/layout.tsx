import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title:       "AiStaffApp",
  description: "Human-on-the-Loop AI Agent Marketplace",
  viewport:    "width=device-width, initial-scale=1, viewport-fit=cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
