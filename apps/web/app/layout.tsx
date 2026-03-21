import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default:  "AiStaff — AI Agent, Talent & Robotics Marketplace",
    template: "%s | AiStaff",
  },
  description:
    "AiStaff is a triple-threat AI marketplace: hire vetted AI engineers (AiTalent), deploy autonomous AI agents (AiStaff), or rent hardware-integrated AI solutions (AiRobot). Every transaction is escrow-backed, ZK-verified, and protected by a 30-second human veto window.",
  keywords: [
    "AI agent marketplace", "hire AI engineers", "deploy AI agents", "AI talent platform",
    "autonomous AI workers", "AI robotics rental", "vetted AI freelancers",
    "escrow AI deployment", "ZK identity verification", "AI automation marketplace",
  ],
  authors:  [{ name: "AiStaff", url: "https://aistaffglobal.com" }],
  creator:  "AiStaff",
  metadataBase: new URL("https://aistaffglobal.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type:        "website",
    locale:      "en_US",
    url:         "https://aistaffglobal.com",
    siteName:    "AiStaff",
    title:       "AiStaff — AI Agent, Talent & Robotics Marketplace",
    description: "Deploy AI agents, hire vetted AI engineers, rent AI robotics — all escrow-backed with a 7-day warranty and ZK biometric identity.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "AiStaff — AI-Native Marketplace" }],
  },
  twitter: {
    card:        "summary_large_image",
    site:        "@aistaff",
    title:       "AiStaff — AI Agent, Talent & Robotics Marketplace",
    description: "Deploy AI agents, hire vetted AI engineers, rent AI robotics — all escrow-backed with a 7-day warranty and ZK biometric identity.",
    images:      ["/opengraph-image"],
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      { rel: "manifest", url: "/site.webmanifest" },
    ],
  },
  other: {
    "fb:app_id": process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ?? "",
  },
  robots: {
    index:          true,
    follow:         true,
    googleBot: {
      index:               true,
      follow:              true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet":       -1,
    },
  },
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
