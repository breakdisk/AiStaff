import type { Metadata } from "next";
import RoiCalculatorClient from "./RoiCalculatorClient";

export function generateMetadata(): Metadata {
  return {
    title: "AI ROI Calculator — AiStaff",
    description:
      "Calculate your return on investment when replacing manual tasks with AI agents. Compare human cost vs agent deployment cost with AiStaff's escrow-backed marketplace.",
    openGraph: {
      title: "AI ROI Calculator",
      description: "Compare human cost vs AI agent deployment cost. Shareable results.",
      images: [
        {
          url: "/api/og?name=AI+ROI+Calculator&desc=Human+cost+vs+agent+cost+calculator&price=Free",
          width: 1200,
          height: 630,
        },
      ],
    },
  };
}

export default function RoiCalculatorPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "AI ROI Calculator",
            description:
              "Calculate ROI of replacing manual tasks with AI agents on AiStaff marketplace.",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            url: "https://aistaffglobal.com/tools/roi-calculator",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          }),
        }}
      />
      <RoiCalculatorClient />
    </>
  );
}
