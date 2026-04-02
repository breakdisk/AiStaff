import type { Metadata } from "next";
import TrustScoreClient from "./TrustScoreClient";

export function generateMetadata(): Metadata {
  return {
    title: "Trust Score Explainer — AiStaff",
    description:
      "Understand how AiStaff calculates freelancer trust scores: GitHub activity (30%), LinkedIn profile (30%), and ZK biometric verification (40%). Interactive formula breakdown.",
  };
}

const FAQ_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is an AiStaff trust score?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A 0–100 score combining GitHub activity (30%), LinkedIn profile (30%), and Zero-Knowledge biometric verification (40%). It determines identity tier and marketplace visibility.",
      },
    },
    {
      "@type": "Question",
      name: "How do I increase my trust score?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Connect GitHub and LinkedIn OAuth for +30 points each. Complete ZK biometric verification for +40 points. The maximum score of 100 requires all three.",
      },
    },
    {
      "@type": "Question",
      name: "What is biometric verification on AiStaff?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "AiStaff uses Groth16 ZK proofs over the BN254 curve. Raw biometric data is never stored — only a Blake3 cryptographic commitment is persisted server-side.",
      },
    },
    {
      "@type": "Question",
      name: "What are the identity tiers?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Unverified (0–39): limited marketplace access. SocialVerified (40–69): can submit proposals and receive escrow. BiometricVerified (70–100): full platform access including payout release.",
      },
    },
  ],
};

export default function TrustScorePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_LD) }}
      />
      <TrustScoreClient />
    </>
  );
}
