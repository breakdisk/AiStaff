import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title:       "AiStaffApp",
  description: "Human-on-the-Loop AI Agent Marketplace",
};

export const viewport: Viewport = {
  width:       "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
