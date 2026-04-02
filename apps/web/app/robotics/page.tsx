import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "AI Robotics Rental — AiStaff",
  description:
    "Rent hardware-integrated AI robotic solutions with real-time telemetry, remote veto control, artifact drift detection, and automated warranty claims. AiStaff's AiRobot marketplace.",
  alternates: { canonical: "/robotics" },
  openGraph: {
    title: "AI Robotics Rental — AiStaff",
    description:
      "Hardware-integrated AI solutions with 30s veto window, 7-day warranty, and real-time heartbeat telemetry.",
    images: [
      {
        url: "/api/og?name=AI+Robotics+Rental&desc=Hardware-integrated+AI+with+escrow+protection&price=Vetted+operators",
        width: 1200,
        height: 630,
      },
    ],
  },
};

const STATS = [
  { value: "30s", label: "Human veto window before escrow moves" },
  { value: "7-day", label: "Warranty on every deployment" },
  { value: "Real-time", label: "Heartbeat telemetry monitoring" },
];

const FEATURES = [
  {
    title: "Remote Deployment",
    detail:
      "Configure and trigger robotic deployments remotely via the AiStaff dashboard. Pre-flight environment checks run before the veto window opens.",
  },
  {
    title: "Heartbeat Telemetry",
    detail:
      "Real-time telemetry streams from deployed hardware to the AiStaff telemetry_service. Health status visible on the operator dashboard with sub-second latency.",
  },
  {
    title: "Drift Detection",
    detail:
      "SHA-256 hash comparison on every deployed artifact. Any deviation from the verified module hash triggers an automatic VETO_WINDOW hold and warranty claim.",
  },
  {
    title: "30s Veto Window",
    detail:
      "Every escrow movement passes through a 30-second human-in-the-loop review. Server-clock enforced — cannot be bypassed by the client or operator.",
  },
  {
    title: "Warranty Claims",
    detail:
      "7-day warranty on every robotics deployment. Drift proof submitted automatically via drift_events Kafka event. Resolution options: REMEDIATED, REFUNDED, or REJECTED.",
  },
  {
    title: "ZK Operator Identity",
    detail:
      "Every operator verified via Groth16/BN254 zero-knowledge biometric proof. Trust score combines GitHub activity, LinkedIn verification, and biometric ZK tier.",
  },
];

const USE_CASES = [
  {
    title: "Manufacturing QC",
    detail:
      "Vision-equipped robotic arms perform in-line quality inspection at production line speeds — defect detection rates above 98% on surface anomalies, dimensional tolerances, and assembly verification.",
  },
  {
    title: "Warehouse Logistics",
    detail:
      "Autonomous mobile robots (AMR) with LiDAR-based navigation handle pick-and-place, putaway, and cycle counting in high-density warehouses — integrating with WMS via Kafka event streams.",
  },
  {
    title: "Healthcare Assistance",
    detail:
      "Sterile dispensing robots for pharmacy automation and surgical instrument tracking — FDA-regulated deployments with full audit trails on every dispensing event.",
  },
  {
    title: "Field Inspection",
    detail:
      "Drone and crawler platforms with real-time video streaming for infrastructure inspection — power lines, pipelines, bridge decks. Telemetry streams anomaly alerts with GPS coordinates.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    text: "Browse AiRobot listings by hardware category and capability. Each listing includes telemetry specs, deployment requirements, and operator trust score.",
  },
  {
    step: "02",
    text: "Fund escrow with a UUID v7 transaction ID. The environment orchestrator runs pre-flight checks on target infrastructure before the veto window opens.",
  },
  {
    step: "03",
    text: "Monitor deployment via the real-time heartbeat telemetry dashboard. Artifact drift triggers automatic warranty claims. Veto any deployment in the first 30 seconds.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "AI Robotics Rental",
  description:
    "Rent hardware-integrated AI robotic solutions with real-time telemetry, remote veto control, artifact drift detection, and automated warranty claims on AiStaff.",
  provider: {
    "@type": "Organization",
    name: "AiStaff",
    url: "https://aistaffglobal.com",
  },
  areaServed: "Worldwide",
  serviceType: "AI Robotics Rental",
  offers: {
    "@type": "Offer",
    description:
      "Escrow-backed robotics rental with 7-day warranty and ZK-verified operator identity.",
  },
};

export default function RoboticsPage() {
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
            <span className="text-zinc-50">AI Robotics</span>
          </nav>

          {/* Hero */}
          <h1 className="text-xl font-mono font-semibold text-zinc-50 mb-3">
            AI Robotics as a Service
          </h1>
          <p className="text-sm font-mono text-zinc-300 leading-relaxed mb-6 border-l-2 border-amber-400 pl-4">
            AiStaff&apos;s AiRobot marketplace connects operators of
            hardware-integrated AI solutions with clients in manufacturing,
            logistics, healthcare, and field inspection. Every deployment runs
            through the same escrow, ZK identity, and veto-window pipeline as
            software agents — real-time heartbeat telemetry and SHA-256 artifact
            drift detection are included on every rental.
          </p>

          {/* Key stats */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {STATS.map((s) => (
              <div
                key={s.value}
                className="p-4 bg-zinc-900 border border-zinc-800 rounded-sm text-center"
              >
                <div className="text-lg font-mono font-semibold text-amber-400 mb-1">
                  {s.value}
                </div>
                <div className="text-xs font-mono text-zinc-400">{s.label}</div>
              </div>
            ))}
          </div>

          {/* How it works */}
          <section className="mb-8">
            <h2 className="text-base font-mono font-semibold text-zinc-50 mb-4">
              How It Works
            </h2>
            <div className="space-y-3">
              {HOW_IT_WORKS.map(({ step, text }) => (
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

          {/* Features grid */}
          <section className="mb-8">
            <h2 className="text-base font-mono font-semibold text-zinc-50 mb-4">
              Platform Features
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="p-4 bg-zinc-900 border border-zinc-800 rounded-sm"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-sm font-mono font-semibold text-zinc-50">
                      {f.title}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-zinc-400">{f.detail}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Use cases */}
          <section className="mb-8">
            <h2 className="text-base font-mono font-semibold text-zinc-50 mb-4">
              Use Cases
            </h2>
            <div className="space-y-3">
              {USE_CASES.map((uc) => (
                <div
                  key={uc.title}
                  className="p-4 bg-zinc-900 border border-zinc-800 rounded-sm"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-sm font-mono font-semibold text-zinc-50">
                      {uc.title}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-zinc-400 ml-6">
                    {uc.detail}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <div className="flex">
            <Link
              href="/marketplace?category=AiRobot"
              className="inline-flex items-center gap-2 px-5 py-3 bg-amber-400 text-zinc-950 text-sm font-mono font-semibold rounded-sm hover:bg-amber-300 transition-colors"
            >
              Browse AiRobot Listings
              <span aria-hidden="true">-&gt;</span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
