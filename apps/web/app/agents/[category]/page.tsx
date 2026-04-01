import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle } from "lucide-react";

const CATEGORIES = ["aistaff", "aitalent", "airobot"] as const;
type Category = (typeof CATEGORIES)[number];

export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ category }));
}

type CategoryMeta = {
  label: string;
  headline: string;
  description: string;
  features: string[];
  marketplaceParam: string;
  howItWorks: { step: string; text: string }[];
};

const CAT_META: Record<Category, CategoryMeta> = {
  aistaff: {
    label: "AI Agents",
    headline: "Deploy Autonomous AI Agents",
    description:
      "Wasm-sandboxed AI agents for workflow automation, customer support, data processing, and autonomous task execution. Every agent runs in an isolated Wasmtime sandbox with cryptographic hash verification before load. Deployments are escrow-gated with a 30-second human-in-the-loop veto window — no escrow moves without human approval. Artifact drift is detected via SHA-256 hash comparison, triggering automatic warranty claims if any module deviates from its verified state after deployment.",
    features: [
      "Wasmtime sandbox isolation",
      "Artifact hash verification",
      "Kafka event sourcing",
      "7-day warranty on all deployments",
    ],
    marketplaceParam: "AiStaff",
    howItWorks: [
      {
        step: "01",
        text: "Browse the AI Agent catalog — filter by category (data sync, HR automation, contract review, infrastructure scaling) and deployment requirements.",
      },
      {
        step: "02",
        text: "Fund escrow with a UUID v7 transaction ID. Payment is held until your DoD checklist finalizes and both parties hold Tier 1+ verified identity.",
      },
      {
        step: "03",
        text: "Deploy through the 30-second veto window. The agent runs inside a Wasmtime sandbox — no arbitrary host code execution. SHA-256 hash verified on every load.",
      },
    ],
  },
  aitalent: {
    label: "AI Talent",
    headline: "Hire Vetted AI Engineers",
    description:
      "ZK-verified AI engineers and ML practitioners for custom model training, LLM integration, data pipelines, and AI system architecture. Trust scores combine GitHub contribution history (30%), LinkedIn professional verification (30%), and Groth16 zero-knowledge biometric proof (40%) — producing a 0–100 score that determines identity tier. Freelancers at Tier 1 (SocialVerified, score ≥ 40) unlock proposal submission. Tier 2 (BiometricVerified, score ≥ 70) unlocks escrow payout approval. No raw biometric data is stored — only Blake3(nonce || proof) commitment.",
    features: [
      "Groth16 ZK identity verification",
      "GitHub + LinkedIn trust scoring",
      "Escrow-backed milestones",
      "Proposal Copilot AI matching",
    ],
    marketplaceParam: "AiTalent",
    howItWorks: [
      {
        step: "01",
        text: "Post a job with required skills, budget, and timeline. The AiStaff Proposal Copilot generates a structured Statement of Work from your description.",
      },
      {
        step: "02",
        text: "Review proposals from ZK-verified engineers. Each profile shows trust score breakdown: GitHub commits, LinkedIn tenure, and biometric ZK tier.",
      },
      {
        step: "03",
        text: "Deploy with escrow protection — milestones gated by Definition of Done checklist steps. 7-day warranty on every deliverable.",
      },
    ],
  },
  airobot: {
    label: "AI Robotics",
    headline: "Rent AI-Integrated Robotics",
    description:
      "Hardware-integrated AI solutions with real-time telemetry, remote deployment control, and artifact drift detection. Every rental includes a 30-second human veto window before any escrow moves and automated warranty claims on SHA-256 artifact drift. Heartbeat telemetry streams to the AiStaff telemetry_service — operators see real-time health status and receive drift alerts before they become failures. The same ZK identity backbone that verifies software engineers authenticates robotics operators, ensuring every deployment has a verified, accountable human in the loop.",
    features: [
      "Real-time heartbeat telemetry",
      "Artifact drift detection",
      "Remote veto control",
      "Automated warranty claims",
    ],
    marketplaceParam: "AiRobot",
    howItWorks: [
      {
        step: "01",
        text: "Browse AiRobot listings by hardware category — robotic arms, inspection drones, warehouse automation units. Each listing shows telemetry specs and deployment requirements.",
      },
      {
        step: "02",
        text: "Fund escrow and configure deployment parameters. The environment orchestrator runs pre-flight checks before the 30-second veto window opens.",
      },
      {
        step: "03",
        text: "Monitor deployment via real-time heartbeat telemetry dashboard. Artifact drift triggers automatic warranty claims with SHA-256 proof of deviation.",
      },
    ],
  },
};

export function generateMetadata({
  params,
}: {
  params: { category: Category };
}): Metadata {
  const meta = CAT_META[params.category];
  return {
    title: `${meta.label} Marketplace — AiStaff`,
    description: meta.description.slice(0, 200),
    alternates: { canonical: `/agents/${params.category}` },
    openGraph: {
      title: `${meta.label} Marketplace — AiStaff`,
      description: `${meta.headline} on AiStaff. Escrow-backed, ZK-verified.`,
    },
  };
}

const OFFER_CATALOG_JSONLD = (cat: CategoryMeta, category: Category) => ({
  "@context": "https://schema.org",
  "@type": "OfferCatalog",
  name: `${cat.label} Marketplace`,
  description: cat.description,
  provider: {
    "@type": "Organization",
    name: "AiStaff",
    url: "https://aistaffglobal.com",
  },
  url: `https://aistaffglobal.com/agents/${category}`,
  itemListElement: cat.features.map((f, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: f,
  })),
});

export default function AgentCategoryPage({
  params,
}: {
  params: { category: Category };
}) {
  const meta = CAT_META[params.category];
  const jsonLd = OFFER_CATALOG_JSONLD(meta, params.category);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="min-h-screen bg-zinc-950 text-zinc-50">
        <div className="max-w-3xl mx-auto px-4 py-10">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 text-xs font-mono text-zinc-400 mb-6">
            <Link href="/" className="hover:text-amber-400 transition-colors">
              Home
            </Link>
            <span>/</span>
            <span className="text-zinc-300">Agents</span>
            <span>/</span>
            <span className="text-zinc-50">{meta.label}</span>
          </nav>

          {/* H1 */}
          <h1 className="text-xl font-mono font-semibold text-zinc-50 mb-4">
            {meta.headline}
          </h1>

          {/* Description */}
          <p className="text-sm font-mono text-zinc-300 leading-relaxed mb-6 border-l-2 border-amber-400 pl-4">
            {meta.description}
          </p>

          {/* Feature grid */}
          <section className="mb-8">
            <h2 className="text-base font-mono font-semibold text-zinc-50 mb-4">
              Platform Features
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {meta.features.map((f) => (
                <div
                  key={f}
                  className="flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-sm"
                >
                  <CheckCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-sm font-mono text-zinc-300">{f}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Trust signals row */}
          <div className="flex flex-wrap gap-2 mb-8">
            {[
              "Escrow-Backed",
              "ZK Identity Verified",
              "30s Veto Window",
            ].map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono bg-zinc-900 border border-zinc-800 text-amber-400 rounded-sm"
              >
                <CheckCircle className="w-3 h-3" />
                {badge}
              </span>
            ))}
          </div>

          {/* How it works */}
          <section className="mb-8">
            <h2 className="text-base font-mono font-semibold text-zinc-50 mb-4">
              How It Works
            </h2>
            <div className="space-y-3">
              {meta.howItWorks.map(({ step, text }) => (
                <div
                  key={step}
                  className="flex gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-sm"
                >
                  <span className="text-amber-400 font-mono text-sm font-semibold shrink-0 w-6">
                    {step}
                  </span>
                  <p className="text-sm font-mono text-zinc-300">{text}</p>
                </div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <div className="flex">
            <Link
              href={`/marketplace?category=${meta.marketplaceParam}`}
              className="inline-flex items-center gap-2 px-5 py-3 bg-amber-400 text-zinc-950 text-sm font-mono font-semibold rounded-sm hover:bg-amber-300 transition-colors"
            >
              Browse {meta.label}
              <span aria-hidden="true">-&gt;</span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
