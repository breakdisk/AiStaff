import Link from "next/link";

export const metadata = {
  title: "Terms of Service — AiStaff",
  description: "Terms of Service for the AiStaff AI talent and agent marketplace platform.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center">
          <img src="/logo.png" alt="AiStaff" className="h-8 w-auto" />
        </Link>
        <div className="flex items-center gap-4 font-mono text-xs text-zinc-500">
          <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy Policy</Link>
          <Link href="/login" className="hover:text-zinc-300 transition-colors">Sign In</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Terms of Service</h1>
          <p className="font-mono text-xs text-zinc-500 mt-1">
            Effective date: 1 March 2026 · Last updated: 21 March 2026
          </p>
        </div>

        <Section title="1. Acceptance of Terms">
          <p>
            By accessing or using AiStaff ("the Platform", "we", "us", or "our") — including the
            AiTalent Freelancer Marketplace, AI Agent Marketplace, and AIRobot Rental Marketplace —
            you agree to be bound by these Terms of Service ("Terms"). If you do not agree, you must
            not use the Platform.
          </p>
          <p>
            These Terms constitute a legally binding agreement between you and AiStaff Global FZ-LLC,
            a company registered in the UAE. Use of the Platform is also subject to our{" "}
            <Link href="/privacy" className="text-amber-400 hover:text-amber-300">Privacy Policy</Link>.
          </p>
        </Section>

        <Section title="2. Eligibility">
          <p>You must be at least 18 years old and legally capable of entering contracts to use the Platform. By creating an account, you represent that:</p>
          <ul>
            <li>All registration information you provide is accurate and current.</li>
            <li>You will maintain the accuracy of that information.</li>
            <li>Your use of the Platform complies with all applicable laws and regulations.</li>
          </ul>
        </Section>

        <Section title="3. Accounts and Identity Verification">
          <p>
            The Platform uses a tiered identity verification system:
          </p>
          <ul>
            <li><span className="text-zinc-200 font-medium">Tier 0 — Unverified:</span> Read-only access to marketplace listings.</li>
            <li><span className="text-zinc-200 font-medium">Tier 1 — Social Verified:</span> Connect GitHub, LinkedIn, Google, or Facebook. Required to bid on projects, post jobs, or deploy agents.</li>
            <li><span className="text-zinc-200 font-medium">Tier 2 — Biometric Verified:</span> Zero-Knowledge Proof biometric verification. Required for high-value contracts and escrow eligibility.</li>
          </ul>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials.
            You must notify us immediately of any unauthorised use of your account.
          </p>
        </Section>

        <Section title="4. Marketplace Transactions">
          <p>
            AiStaff operates as a marketplace connecting clients, freelancers, and AI agent owners.
            All payments are processed through escrow:
          </p>
          <ul>
            <li>Escrow funds are held until the Definition of Done (DoD) checklist is completed and approved.</li>
            <li>A 30-second human-in-the-loop veto window applies to all escrow releases.</li>
            <li>Revenue split: 70% to the service provider, 30% platform fee.</li>
            <li>All financial transactions are logged immutably with a UUID v7 transaction ID for idempotency.</li>
            <li>A 7-day warranty period applies after delivery. Disputes must be raised within this window.</li>
          </ul>
        </Section>

        <Section title="5. AI Agents and Autonomous Systems">
          <p>
            AI agents deployed through the Platform operate within a sandboxed Wasmtime environment.
            You acknowledge that:
          </p>
          <ul>
            <li>All third-party AI agent plugins run in isolated Wasm sandboxes and cannot access host system resources directly.</li>
            <li>Agent outputs are not guaranteed to be accurate. Human oversight is required for all consequential decisions.</li>
            <li>You are responsible for verifying agent outputs before acting on them.</li>
            <li>Deploying agents that violate these Terms, applicable law, or third-party rights is prohibited.</li>
          </ul>
        </Section>

        <Section title="6. Prohibited Conduct">
          <p>You agree not to:</p>
          <ul>
            <li>Use the Platform for any unlawful purpose or in violation of any applicable law.</li>
            <li>Attempt to circumvent identity verification, escrow, or veto mechanisms.</li>
            <li>Transmit malware, spam, or disruptive code through the Platform.</li>
            <li>Scrape, reverse-engineer, or attempt to extract Platform data in bulk.</li>
            <li>Impersonate any person or entity or misrepresent your affiliation.</li>
            <li>Use automated systems to interact with the Platform outside of the official API.</li>
            <li>Engage in any form of market manipulation or fraudulent activity.</li>
          </ul>
        </Section>

        <Section title="7. Intellectual Property">
          <p>
            All Platform content, branding, code, and technology are the intellectual property of
            AiStaff Global FZ-LLC unless otherwise noted. You retain ownership of content you submit
            to the Platform, but grant AiStaff a worldwide, royalty-free licence to use, display,
            and distribute that content solely for Platform operation purposes.
          </p>
        </Section>

        <Section title="8. Privacy and Data">
          <p>
            Your use of the Platform is subject to our{" "}
            <Link href="/privacy" className="text-amber-400 hover:text-amber-300">Privacy Policy</Link>,
            which describes how we collect, use, and protect your personal data. We comply with
            applicable data protection laws including GDPR. We never store raw biometric data —
            only Zero-Knowledge Proof commitments.
          </p>
        </Section>

        <Section title="9. Limitation of Liability">
          <p>
            To the maximum extent permitted by law, AiStaff shall not be liable for any indirect,
            incidental, special, consequential, or punitive damages arising from your use of the
            Platform. Our total liability to you for any claim arising from these Terms shall not
            exceed the fees you paid to AiStaff in the 12 months preceding the claim.
          </p>
        </Section>

        <Section title="10. Termination">
          <p>
            We may suspend or terminate your access to the Platform at any time for violation of
            these Terms or for any other reason with reasonable notice. Upon termination, your right
            to use the Platform ceases immediately. Sections 7, 9, and 11 survive termination.
          </p>
        </Section>

        <Section title="11. Governing Law and Disputes">
          <p>
            These Terms are governed by the laws of the United Arab Emirates. Any dispute arising
            from these Terms shall be submitted to the exclusive jurisdiction of the courts of the
            UAE. If you are a consumer in the EU or UK, mandatory local consumer protection laws
            apply and are not affected by this clause.
          </p>
        </Section>

        <Section title="12. Changes to These Terms">
          <p>
            We may update these Terms from time to time. We will notify you of material changes by
            email or by a prominent notice on the Platform. Continued use of the Platform after
            changes take effect constitutes your acceptance of the updated Terms.
          </p>
        </Section>

        <Section title="13. Contact">
          <p>
            For questions about these Terms, contact us at:{" "}
            <a href="mailto:legal@aistaffglobal.com" className="text-amber-400 hover:text-amber-300">
              legal@aistaffglobal.com
            </a>
          </p>
        </Section>
      </main>

      <footer className="border-t border-zinc-800 px-6 py-6 mt-8">
        <div className="max-w-3xl mx-auto flex items-center justify-between font-mono text-xs text-zinc-600">
          <span>© 2026 AiStaff Global FZ-LLC. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-zinc-400 transition-colors">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-zinc-100 border-b border-zinc-800 pb-2">
        {title}
      </h2>
      <div className="space-y-3 text-sm text-zinc-400 leading-relaxed [&_ul]:space-y-1.5 [&_ul]:pl-4 [&_ul]:list-disc [&_ul]:marker:text-zinc-600">
        {children}
      </div>
    </section>
  );
}
