import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle } from "lucide-react";

const SKILLS = [
  "rust",
  "python",
  "typescript",
  "devops",
  "ml-engineer",
  "llm-integration",
  "data-engineer",
] as const;

const INDUSTRIES = [
  "fintech",
  "healthcare",
  "logistics",
  "legal",
  "hr-automation",
  "e-commerce",
  "saas",
] as const;

type Skill = (typeof SKILLS)[number];
type Industry = (typeof INDUSTRIES)[number];

export function generateStaticParams() {
  return SKILLS.flatMap((skill) =>
    INDUSTRIES.map((industry) => ({ skill, industry }))
  );
}

const SKILL_LABELS: Record<Skill, string> = {
  rust: "Rust",
  python: "Python",
  typescript: "TypeScript",
  devops: "DevOps",
  "ml-engineer": "ML Engineer",
  "llm-integration": "LLM Integration",
  "data-engineer": "Data Engineer",
};

const INDUSTRY_LABELS: Record<Industry, string> = {
  fintech: "Fintech",
  healthcare: "Healthcare",
  logistics: "Logistics",
  legal: "Legal",
  "hr-automation": "HR Automation",
  "e-commerce": "E-Commerce",
  saas: "SaaS",
};

export function generateMetadata({
  params,
}: {
  params: { skill: Skill; industry: Industry };
}): Metadata {
  const s = SKILL_LABELS[params.skill] ?? params.skill;
  const ind = INDUSTRY_LABELS[params.industry] ?? params.industry;
  return {
    title: `Hire a ${s} AI Engineer for ${ind} — AiStaff`,
    description: `Find vetted ${s} AI engineers for ${ind} projects on AiStaff. Escrow-backed, ZK-verified identity, 7-day warranty, 30-second veto window on every deployment.`,
    alternates: { canonical: `/hire/${params.skill}/${params.industry}` },
    openGraph: {
      title: `Hire a ${s} AI Engineer for ${ind}`,
      description: `Vetted ${s} talent for ${ind}. Escrow-backed deployments on AiStaff.`,
      images: [
        {
          url: `/api/og?name=Hire+${encodeURIComponent(s)}+for+${encodeURIComponent(ind)}&desc=Vetted+AI+engineers+escrow-backed&price=From+%2450%2Fhr`,
          width: 1200,
          height: 630,
        },
      ],
    },
  };
}

// Key-combination content for "Why {skill} for {industry}" section
const WHY_CONTENT: Partial<Record<Skill, Partial<Record<Industry, string[]>>>> =
  {
    rust: {
      fintech: [
        "Memory-safe transaction processing eliminates entire classes of buffer overflow vulnerabilities in payment pipelines — no garbage collector pauses during settlement.",
        "Zero-cost abstractions deliver C-level throughput for high-frequency trading and real-time settlement systems, handling millions of order events per second on commodity hardware.",
        "Fearless concurrency enables parallel order-book processing without data races or deadlocks — the Rust compiler enforces thread safety at compile time, before any trade executes.",
      ],
      healthcare: [
        "Compile-time memory safety prevents data corruption in patient record systems with no runtime overhead — critical for FDA-regulated software requiring deterministic behavior.",
        "Deterministic performance suits real-time medical device firmware and telemetry pipelines — Rust's predictable latency profile eliminates jitter that could mask clinical anomalies.",
        "Strong type system enforces HIPAA data-classification rules at compile time, not runtime — PII fields modeled as distinct types cannot be passed to logging functions without explicit conversion.",
      ],
      logistics: [
        "Async Rust handles thousands of simultaneous fleet tracking connections with sub-millisecond latency — no thread-per-connection overhead on edge routing nodes.",
        "Rust's ownership model prevents use-after-free bugs in route-optimization caches — critical when stale data causes mis-routing of time-sensitive freight.",
        "Cross-compilation to embedded targets allows the same Rust codebase to run on warehouse PLCs and cloud aggregation services, eliminating dual-maintenance overhead.",
      ],
      legal: [
        "Rust's deterministic execution makes document-hash verification auditable and reproducible — SHA-256 checksums computed in Rust produce identical outputs across all jurisdictions.",
        "Type-safe contract state machines prevent illegal transitions — a signed NDA cannot be reverted to draft status without a compile-time error.",
        "Memory safety eliminates the class of vulnerabilities that have compromised legal document management systems, reducing e-discovery liability surface.",
      ],
    },
    python: {
      fintech: [
        "Python's pandas and polars libraries deliver institutional-grade time-series analysis on tick data — vectorized operations process millions of price points in seconds for backtesting.",
        "Scikit-learn and XGBoost fraud detection models integrate directly with real-time transaction streams via FastAPI, reducing false-positive chargebacks without manual rules.",
        "Python's regulatory reporting ecosystem — XBRL, SWIFT MT parsing, FIX protocol — has mature libraries with no viable equivalent in other languages, reducing integration time by 60–80%.",
      ],
      healthcare: [
        "Python's FHIR R4 libraries (fhir.resources, fhirpy) enable HIPAA-compliant HL7 data exchange between EHR systems — the only language with production-grade FHIR tooling.",
        "PyTorch and MONAI deliver clinical-grade medical imaging pipelines for CT, MRI, and pathology slide analysis, with pre-trained models certified for FDA 510(k) submissions.",
        "Python's SciPy stack enables pharmacokinetic modeling and clinical trial statistical analysis with reproducible Jupyter notebooks that satisfy FDA 21 CFR Part 11 audit requirements.",
      ],
      logistics: [
        "OR-Tools (Google) Python bindings solve vehicle routing problems with time windows at scale — optimizing 10,000-stop delivery routes in under 30 seconds on standard hardware.",
        "Python's geospatial stack (GeoPandas, Shapely, OSRM) powers real-time route recalculation using live traffic data, reducing average delivery time by 15–25% in dense urban networks.",
        "FastAPI async endpoints expose Python optimization solvers to mobile drivers with sub-100ms response times, replacing slow overnight batch routing with on-demand recalculation.",
      ],
      "hr-automation": [
        "Python's NLP stack (spaCy, sentence-transformers) powers resume parsing and JD-to-candidate matching — vectorized skill extraction processes 10,000 applications per hour on a single server.",
        "Celery task queues orchestrate multi-stage hiring workflows: application intake, screening, scheduling, background checks — with full audit trails satisfying EEOC recordkeeping requirements.",
        "Python's integration ecosystem connects to 50+ HRIS platforms (Workday, BambooHR, Greenhouse) via REST and SOAP APIs, reducing integration project timelines from months to days.",
      ],
    },
    typescript: {
      saas: [
        "TypeScript's structural typing enforces API contract consistency across multi-tenant SaaS backends — type errors caught at compile time prevent runtime 500s in production.",
        "Next.js 15 Server Components enable SSR on SaaS dashboards with sub-200ms TTFB, improving trial-to-paid conversion by reducing perceived load time on first meaningful paint.",
        "tRPC with TypeScript provides end-to-end type safety from database schema to React component — a renamed database column propagates as a compile error through the entire call stack.",
      ],
      fintech: [
        "TypeScript's strict null checks prevent the class of undefined-access bugs responsible for incorrect balance displays — a null account balance cannot silently render as zero.",
        "Zod schema validation at API boundaries enforces financial data contracts — a malformed currency code or negative amount is rejected before reaching business logic.",
        "React 19 concurrent features enable real-time portfolio dashboards that remain interactive during data fetching, with optimistic UI for trade confirmations that roll back on failure.",
      ],
      "e-commerce": [
        "TypeScript enables type-safe Shopify and Stripe SDK usage — cart mutations, webhook payloads, and checkout sessions carry full type inference, eliminating runtime mismatches.",
        "Next.js 15 App Router with ISR generates product pages in milliseconds with fresh inventory data, maintaining sub-1s LCP on catalog pages with 100,000+ SKUs.",
        "TypeScript's discriminated unions model order state machines precisely — an order in PAYMENT_PENDING state cannot transition to SHIPPED without passing through PAYMENT_CONFIRMED.",
      ],
    },
    devops: {
      logistics: [
        "Infrastructure-as-code with Terraform and Pulumi provisions geo-distributed edge nodes across 50+ regions, ensuring sub-50ms routing API latency for drivers within 500km of any depot.",
        "Kubernetes horizontal pod autoscaling handles parcel tracking spikes during peak season — fleet tracking services scale from 10 to 500 pods in under 90 seconds without manual intervention.",
        "GitOps pipelines with ArgoCD enforce immutable deployments for dispatch systems — every routing algorithm change passes canary analysis against live traffic before full rollout.",
      ],
      "e-commerce": [
        "CDN configuration and edge caching optimization reduces origin traffic by 80–95% on product catalog pages, handling Black Friday traffic spikes without provisioning additional compute.",
        "Blue-green deployments with automated rollback protect checkout conversion — a deployment that degrades payment success rate by more than 0.5% triggers automatic reversion in under 60 seconds.",
        "Container security scanning (Trivy, Snyk) integrated into CI/CD pipelines blocks deployments with HIGH or CRITICAL CVEs, maintaining PCI DSS compliance without manual security reviews.",
      ],
      saas: [
        "Multi-tenant Kubernetes namespace isolation provides security boundaries between customer workloads — a noisy neighbor's CPU spike cannot starve another tenant's API response times.",
        "Prometheus and Grafana alerting on SLO burn rates enables proactive incident response — 99.9% uptime SLAs are enforced by automated runbooks before customers notice degradation.",
        "Terraform module libraries encode compliance guardrails — every new microservice inherits IAM least-privilege, encryption-at-rest, and VPC isolation without per-team security review.",
      ],
    },
    "ml-engineer": {
      healthcare: [
        "Clinical NLP models (BioBERT, Med-PaLM fine-tunes) extract structured diagnoses from unstructured clinical notes, reducing manual coding time by 70% while maintaining ICD-10 accuracy above 94%.",
        "MLflow experiment tracking with HIPAA-compliant data lineage satisfies FDA 510(k) Software as Medical Device (SaMD) documentation requirements — every model version auditable from training data to deployment.",
        "Federated learning architectures train diagnostic models across hospital networks without centralizing patient data — PHI never leaves the institution's network perimeter, eliminating BAA scope.",
      ],
      fintech: [
        "Real-time fraud detection models (LightGBM, PyTorch tabular) achieve sub-10ms inference on transaction streams, processing 50,000 transactions per second on GPU inference clusters.",
        "Explainable AI (SHAP, LIME) on credit scoring models satisfies ECOA adverse action notice requirements — loan denials include machine-readable reason codes reviewable by regulators.",
        "MLOps pipelines with automated model retraining on concept drift ensure fraud detection accuracy degrades gracefully as attacker patterns shift, without manual retraining cycles.",
      ],
      logistics: [
        "Demand forecasting models (Prophet, temporal fusion transformers) reduce warehouse safety stock by 20–35% by predicting regional demand with 95th-percentile accuracy 14 days ahead.",
        "Computer vision models for package damage detection process 200 images per second on edge GPUs at sorting facilities, flagging damaged shipments before final-mile delivery.",
        "Reinforcement learning dispatch optimizers learn optimal routing policies from historical delivery data, outperforming static OR-Tools solutions by 8–12% on total route cost.",
      ],
    },
    "llm-integration": {
      legal: [
        "LLM contract review pipelines extract clause-level risk scores from NDA and MSA documents using fine-tuned legal language models, reducing associate review time from 4 hours to 15 minutes per document.",
        "Retrieval-augmented generation (RAG) on case law databases enables associates to query precedents in natural language — embedding-indexed Westlaw exports with zero hallucination on cited cases.",
        "Structured LLM output (JSON schema enforcement via Instructor/Outlines) extracts parties, governing law, termination clauses, and liability caps into structured database records for contract lifecycle management.",
      ],
      saas: [
        "LLM-powered onboarding copilots reduce time-to-value for new SaaS users by 60% — natural language queries against product documentation replace 50-page setup guides.",
        "Automated support ticket triage using LLM classification routes P0 incidents to on-call engineers within 30 seconds, reducing MTTR by 40% compared to keyword-based routing.",
        "LLM code generation integrated into developer dashboards (Cursor-style) accelerates feature implementation — internal APIs documented in OpenAPI 3.1 become immediately queryable via natural language.",
      ],
      "hr-automation": [
        "LLM interview question generation from job descriptions and competency frameworks eliminates recruiter prep time — structured interview guides generated in under 10 seconds per role.",
        "Bias detection pipelines run LLM evaluation on job postings before publication, flagging gendered language and exclusionary requirements that reduce diverse candidate application rates.",
        "Automated offer letter generation with LLM fills compensation, title, start date, and benefits from HRIS data, eliminating 30-minute manual drafting per hire across high-volume recruiting.",
      ],
      fintech: [
        "LLM-powered financial document parsing extracts structured data from 10-K filings, earnings call transcripts, and prospectuses — turning 200-page PDFs into queryable structured records in under 2 minutes.",
        "Conversational portfolio analysis agents answer client questions about holdings, risk exposure, and performance attribution in natural language without analyst intervention.",
        "Regulatory change monitoring: LLM classifiers scan daily CFPB, SEC, and FCA publications and flag policy changes requiring product updates, reducing compliance team monitoring burden by 80%.",
      ],
    },
    "data-engineer": {
      fintech: [
        "Apache Kafka and dbt pipelines process real-time transaction event streams into regulatory reporting models — CCAR, DFAST, and MiFID II reports generated from a single source-of-truth data lake.",
        "Column-level data lineage (OpenLineage, Marquez) tracks how each PII field flows from origination to aggregated reports, satisfying GDPR Article 30 and CCPA audit obligations.",
        "Medallion architecture (bronze/silver/gold) on Databricks reduces P&L reconciliation from overnight batch to sub-15-minute incremental processing, enabling intraday risk desk reporting.",
      ],
      healthcare: [
        "HL7 FHIR R4 data pipelines ingest and normalize EHR data from Epic, Cerner, and Athenahealth — a unified patient timeline across systems without PHI leaving the healthcare network.",
        "Delta Lake ACID transactions on patient cohort datasets ensure that concurrent clinical trial queries cannot read partially updated records — FDA audit trail requirements satisfied by transaction logs.",
        "Real-time CDC pipelines (Debezium, Kafka Connect) replicate lab result updates from source EHR to analytics warehouse in under 5 seconds, enabling near-real-time clinical decision support.",
      ],
      saas: [
        "Multi-tenant data warehouse isolation with row-level security in Snowflake ensures SaaS customers cannot query each other's usage metrics — compliance enforced at the data layer, not application layer.",
        "Product analytics pipelines (dbt + Segment) model user event streams into activation funnels, feature adoption cohorts, and churn prediction features — reducing analyst query time from days to hours.",
        "Reverse ETL pipelines sync warehouse-computed scores (health score, expansion propensity) back to Salesforce and Hubspot, enabling CS teams to act on data-warehouse insights without BI tool access.",
      ],
    },
  };

function getWhyContent(skill: Skill, industry: Industry): string[] {
  const skillContent = WHY_CONTENT[skill];
  if (skillContent) {
    const industryContent = skillContent[industry];
    if (industryContent) return industryContent;
  }
  return [
    `${SKILL_LABELS[skill]} engineers bring deep expertise in building reliable, scalable systems for ${INDUSTRY_LABELS[industry]} workflows — AiStaff vets every engineer through GitHub activity analysis and ZK biometric identity verification.`,
    `AiStaff's trust scoring system combines GitHub contribution history (30%), LinkedIn professional verification (30%), and Groth16 zero-knowledge biometric proof (40%) — ensuring every ${SKILL_LABELS[skill]} engineer you hire has verifiable credentials.`,
    `Escrow-backed deployments protect ${INDUSTRY_LABELS[industry]} clients — payment is held in escrow and only released after your DoD checklist passes, the 30-second human veto window elapses, and both parties hold Tier 1+ verified identity.`,
  ];
}

function getIntroText(skill: Skill, industry: Industry): string {
  const s = SKILL_LABELS[skill];
  const ind = INDUSTRY_LABELS[industry];

  const intros: Partial<Record<Skill, Partial<Record<Industry, string>>>> = {
    rust: {
      fintech: `${s} engineers in ${ind} build memory-safe, high-performance systems for payment processing, order book management, and real-time settlement. Rust's ownership model eliminates the buffer overflows and null-pointer dereferences that have caused catastrophic losses in financial systems. On AiStaff, every ${s} engineer is verified via Groth16 zero-knowledge proof — identity confirmed without exposing biometric data. Deployments are escrow-gated: funds held until your DoD checklist passes and a 30-second human veto window elapses. A 7-day warranty covers artifact drift detected via SHA-256 hash comparison on every deployed module.`,
      healthcare: `${s} engineers in ${ind} deliver deterministic, memory-safe systems for patient data management, medical device firmware, and real-time clinical telemetry. Rust's compile-time guarantees eliminate runtime panics in systems where uptime directly affects patient outcomes. AiStaff verifies every engineer's identity via Groth16 ZK biometric proof — no raw biometric data stored anywhere in the pipeline. Escrow holds client funds until deployment milestones are confirmed and the veto window elapses. The 7-day warranty enables automatic warranty claims if deployed artifacts drift from their verified hash.`,
    },
    python: {
      fintech: `${s} engineers in ${ind} build quantitative models, fraud detection pipelines, and regulatory reporting systems that process millions of transactions daily. Python's mature financial ecosystem — pandas, polars, PyTorch, scikit-learn — provides production-grade tools with no equivalent in other languages. AiStaff's marketplace lists only engineers with verified GitHub contribution histories and ZK-authenticated identity. Every engagement runs through escrow with a 30-second human veto window and 7-day warranty on deployed artifacts.`,
      healthcare: `${s} engineers in ${ind} build HIPAA-compliant data pipelines, clinical NLP models, and FHIR-integrated EHR connectors that process sensitive patient data at scale. Python's clinical data ecosystem — fhirpy, PyTorch, MONAI, SciPy — is unmatched for healthcare-specific ML and data engineering. AiStaff verifies engineer identity via ZK biometric proof and escrow-gates every deployment — payment releases only after milestone approval and the 30-second veto window.`,
    },
  };

  return (
    intros[skill]?.[industry] ??
    `${s} engineers in ${ind} build production systems that require deep domain expertise in both the technology and the regulatory, operational, and performance requirements of the industry. AiStaff connects ${ind} companies with pre-vetted ${s} talent whose GitHub activity and identity are verified via Groth16 zero-knowledge proofs. Every deployment is escrow-backed — funds are held until your Definition of Done checklist passes, a 30-second human veto window elapses, and both parties hold verified Tier 1+ identity. A 7-day warranty provides automatic protection against artifact drift, with SHA-256 hash comparison on every deployed module.`
  );
}

const GUARANTEES = [
  {
    title: "Escrow Protection",
    detail:
      "Funds held until DoD checklist passes, veto window elapses, and identity verified. No payment released early.",
  },
  {
    title: "ZK Biometric Identity",
    detail:
      "Every engineer verified via Groth16/BN254 zero-knowledge proof. No raw biometric data stored or transmitted.",
  },
  {
    title: "Wasm Sandbox Isolation",
    detail:
      "Agent and tool execution runs inside Wasmtime — no arbitrary code execution on host infrastructure.",
  },
  {
    title: "Groth16 Proof Verification",
    detail:
      "Identity proofs verified server-side in identity_service only. Nonces are single-use and invalidated after submission.",
  },
];

export default function HirePage({
  params,
}: {
  params: { skill: Skill; industry: Industry };
}) {
  const s = SKILL_LABELS[params.skill] ?? params.skill;
  const ind = INDUSTRY_LABELS[params.industry] ?? params.industry;
  const whyPoints = getWhyContent(params.skill, params.industry);
  const intro = getIntroText(params.skill, params.industry);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `Hire ${s} AI Engineer for ${ind}`,
    description: `Find vetted ${s} AI engineers for ${ind} projects on AiStaff. Escrow-backed, ZK-verified identity, 7-day warranty.`,
    provider: {
      "@type": "Organization",
      name: "AiStaff",
      url: "https://aistaffglobal.com",
    },
    areaServed: "Worldwide",
    serviceType: "AI Engineering Talent",
  };

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
            <Link
              href="/marketplace"
              className="hover:text-amber-400 transition-colors"
            >
              Hire
            </Link>
            <span>/</span>
            <span className="text-zinc-300">{s}</span>
            <span>/</span>
            <span className="text-zinc-50">{ind}</span>
          </nav>

          {/* H1 */}
          <h1 className="text-xl font-mono font-semibold text-zinc-50 mb-4">
            Hire a {s} AI Engineer for {ind}
          </h1>

          {/* Intro block */}
          <p className="text-sm font-mono text-zinc-300 leading-relaxed mb-6 border-l-2 border-amber-400 pl-4">
            {intro}
          </p>

          {/* Trust signals row */}
          <div className="flex flex-wrap gap-2 mb-8">
            {["ZK Verified Identity", "Escrow-Backed", "7-Day Warranty"].map(
              (badge) => (
                <span
                  key={badge}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono bg-zinc-900 border border-zinc-800 text-amber-400 rounded-sm"
                >
                  <CheckCircle className="w-3 h-3" />
                  {badge}
                </span>
              )
            )}
          </div>

          {/* How It Works */}
          <section className="mb-8">
            <h2 className="text-base font-mono font-semibold text-zinc-50 mb-4">
              How It Works
            </h2>
            <div className="space-y-3">
              {[
                {
                  step: "01",
                  text: `Browse vetted ${s} talent on the AiStaff marketplace — filter by trust score, hourly rate, and industry experience.`,
                },
                {
                  step: "02",
                  text: `Fund escrow — no payment released until milestones pass your Definition of Done checklist and both parties hold verified identity.`,
                },
                {
                  step: "03",
                  text: `Deploy with a 30-second human veto window and 7-day warranty. SHA-256 artifact hash comparison detects any post-deployment drift automatically.`,
                },
              ].map(({ step, text }) => (
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

          {/* Why skill for industry */}
          <section className="mb-8">
            <h2 className="text-base font-mono font-semibold text-zinc-50 mb-4">
              Why {s} for {ind}
            </h2>
            <div className="space-y-3">
              {whyPoints.map((point, i) => (
                <div
                  key={i}
                  className="flex gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-sm"
                >
                  <CheckCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-sm font-mono text-zinc-300">{point}</p>
                </div>
              ))}
            </div>
          </section>

          {/* AiStaff Guarantees */}
          <section className="mb-8">
            <h2 className="text-base font-mono font-semibold text-zinc-50 mb-4">
              AiStaff Guarantees
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {GUARANTEES.map((g) => (
                <div
                  key={g.title}
                  className="p-4 bg-zinc-900 border border-zinc-800 rounded-sm"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-sm font-mono font-semibold text-zinc-50">
                      {g.title}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-zinc-400">{g.detail}</p>
                </div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <div className="flex">
            <Link
              href="/marketplace?category=AiTalent"
              className="inline-flex items-center gap-2 px-5 py-3 bg-amber-400 text-zinc-950 text-sm font-mono font-semibold rounded-sm hover:bg-amber-300 transition-colors"
            >
              Find {s} Engineers for {ind}
              <span aria-hidden="true">-&gt;</span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
