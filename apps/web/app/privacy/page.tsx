import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — AiStaff",
  description: "Privacy Policy for the AiStaff AI talent and agent marketplace platform.",
  openGraph: {
    title: "Privacy Policy — AiStaff",
    description: "Privacy Policy for the AiStaff AI talent and agent marketplace platform.",
    url: "https://aistaffglobal.com/privacy",
    siteName: "AiStaff",
    type: "website",
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center">
          <img src="/logo.png" alt="AiStaff" className="h-8 w-auto" />
        </Link>
        <div className="flex items-center gap-4 font-mono text-xs text-zinc-500">
          <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms of Service</Link>
          <Link href="/login" className="hover:text-zinc-300 transition-colors">Sign In</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Privacy Policy</h1>
          <p className="font-mono text-xs text-zinc-500 mt-1">
            Effective date: 1 March 2026 · Last updated: 21 March 2026
          </p>
        </div>

        <Section title="1. Who We Are">
          <p>
            AiStaff Global FZ-LLC ("AiStaff", "we", "us", "our") operates the AiStaff platform at{" "}
            <a href="https://aistaffglobal.com" className="text-amber-400 hover:text-amber-300">aistaffglobal.com</a>
            , including the AiTalent Freelancer Marketplace, AI Agent Marketplace, and AIRobot Rental
            Marketplace. We are committed to protecting your personal data and complying with
            applicable data protection laws, including the EU General Data Protection Regulation
            (GDPR) and UAE data protection legislation.
          </p>
          <p>
            Data controller:{" "}
            <a href="mailto:privacy@aistaffglobal.com" className="text-amber-400 hover:text-amber-300">
              privacy@aistaffglobal.com
            </a>
          </p>
        </Section>

        <Section title="2. Data We Collect">
          <p>We collect the following categories of personal data:</p>
          <ul>
            <li>
              <span className="text-zinc-200 font-medium">Identity data:</span> Name, email address,
              and profile information provided via OAuth (GitHub, Google, LinkedIn, Facebook).
            </li>
            <li>
              <span className="text-zinc-200 font-medium">Verification data:</span> OAuth provider
              user IDs and connection timestamps. For Tier 2 verification, we store only a
              Zero-Knowledge Proof commitment — a cryptographic hash of{" "}
              <code className="font-mono text-xs bg-zinc-800 px-1 py-0.5 rounded">Blake3(nonce ∥ zk_proof)</code>.
              Raw biometric data is never transmitted or stored.
            </li>
            <li>
              <span className="text-zinc-200 font-medium">Professional data:</span> Skills, hourly
              rate, availability, role, and agency affiliation where provided.
            </li>
            <li>
              <span className="text-zinc-200 font-medium">Transaction data:</span> Escrow records,
              payout amounts, and transaction IDs stored immutably for financial compliance.
            </li>
            <li>
              <span className="text-zinc-200 font-medium">Contract data:</span> NDA/SOW documents
              and SHA-256 document hashes. We store the hash — not the full document — in our
              audit trail.
            </li>
            <li>
              <span className="text-zinc-200 font-medium">Usage data:</span> Log data, IP addresses,
              and session information collected automatically when you use the Platform.
            </li>
            <li>
              <span className="text-zinc-200 font-medium">Communications:</span> Messages, proposals,
              and notifications sent through the Platform.
            </li>
          </ul>
        </Section>

        <Section title="3. How We Use Your Data">
          <p>We process your personal data for the following purposes:</p>
          <ul>
            <li>
              <span className="text-zinc-200 font-medium">Contract performance:</span> Providing and
              operating the marketplace, processing escrow transactions, and facilitating agreements
              between clients and service providers.
            </li>
            <li>
              <span className="text-zinc-200 font-medium">Legal obligation:</span> Maintaining
              immutable financial records, audit logs, and complying with anti-money-laundering
              and KYC requirements.
            </li>
            <li>
              <span className="text-zinc-200 font-medium">Legitimate interest:</span> Fraud
              prevention, platform security, trust score calculation, and reputation management.
            </li>
            <li>
              <span className="text-zinc-200 font-medium">Consent:</span> Sending marketing
              communications (where you have opted in) and optional analytics.
            </li>
          </ul>
        </Section>

        <Section title="4. Biometric Data and Zero-Knowledge Proofs">
          <p>
            Tier 2 identity verification uses Zero-Knowledge Proofs (ZKP) based on the Groth16
            protocol over the BN254 elliptic curve. This means:
          </p>
          <ul>
            <li>Your biometric data is processed locally on your device or by a trusted verification partner.</li>
            <li>Only a cryptographic commitment — <code className="font-mono text-xs bg-zinc-800 px-1 py-0.5 rounded">Blake3(nonce ∥ proof)</code> — is transmitted to and stored by AiStaff.</li>
            <li>This commitment cannot be reversed to reconstruct your biometric data.</li>
            <li>Nonces are single-use and invalidated immediately after proof submission.</li>
            <li>We never store, transmit, or log raw biometric templates at any layer of our infrastructure.</li>
          </ul>
        </Section>

        <Section title="5. Data Sharing">
          <p>We do not sell your personal data. We share data only with:</p>
          <ul>
            <li>
              <span className="text-zinc-200 font-medium">Other Platform users:</span> Your public
              profile, skills, trust score, and reputation badge are visible to other users as
              necessary for marketplace operation.
            </li>
            <li>
              <span className="text-zinc-200 font-medium">Payment processors:</span> Transaction
              details shared with payment providers solely for processing escrow and payouts.
            </li>
            <li>
              <span className="text-zinc-200 font-medium">Infrastructure providers:</span> Cloud
              hosting and email delivery providers under data processing agreements.
            </li>
            <li>
              <span className="text-zinc-200 font-medium">Legal authorities:</span> Where required
              by law, court order, or to protect rights and safety.
            </li>
          </ul>
          <p>
            AI models used on the Platform process data locally or via providers bound by data
            processing agreements. No user data is used to train third-party AI models.
          </p>
        </Section>

        <Section title="6. Data Retention">
          <ul>
            <li>
              <span className="text-zinc-200 font-medium">Financial records:</span> Retained for
              7 years to meet accounting and legal obligations. These cannot be deleted.
            </li>
            <li>
              <span className="text-zinc-200 font-medium">Profile data:</span> Retained while your
              account is active and for 30 days after deletion to allow recovery.
            </li>
            <li>
              <span className="text-zinc-200 font-medium">Telemetry events:</span> Archived after
              90 days, not deleted.
            </li>
            <li>
              <span className="text-zinc-200 font-medium">Audit logs:</span> Append-only; retained
              indefinitely for compliance. Individual entries cannot be deleted.
            </li>
          </ul>
        </Section>

        <Section title="7. Your Rights">
          <p>Depending on your location, you may have the right to:</p>
          <ul>
            <li><span className="text-zinc-200 font-medium">Access:</span> Request a copy of the personal data we hold about you.</li>
            <li><span className="text-zinc-200 font-medium">Rectification:</span> Correct inaccurate or incomplete data.</li>
            <li><span className="text-zinc-200 font-medium">Erasure:</span> Request deletion of your account and profile data (subject to retention obligations for financial records).</li>
            <li><span className="text-zinc-200 font-medium">Portability:</span> Receive your data in a structured, machine-readable format, including W3C Verifiable Credential export of your reputation badge.</li>
            <li><span className="text-zinc-200 font-medium">Objection:</span> Object to processing based on legitimate interests.</li>
            <li><span className="text-zinc-200 font-medium">Withdraw consent:</span> Where processing is based on consent, withdraw it at any time.</li>
          </ul>
          <p>
            To exercise your rights, contact{" "}
            <a href="mailto:privacy@aistaffglobal.com" className="text-amber-400 hover:text-amber-300">
              privacy@aistaffglobal.com
            </a>
            . We will respond within 30 days.
          </p>
        </Section>

        <Section title="8. Cookies and Tracking">
          <p>
            We use only strictly necessary cookies for authentication (session cookies via NextAuth.js).
            We do not use third-party advertising trackers. When you log in via a social provider
            (GitHub, Google, LinkedIn, Facebook), that provider's own privacy policy applies to
            the data they collect during authentication.
          </p>
        </Section>

        <Section title="9. Security">
          <p>
            We implement technical and organisational measures to protect your data, including:
          </p>
          <ul>
            <li>TLS 1.3 encryption for all data in transit.</li>
            <li>All services operate under zero-trust networking with short-lived internal JWTs (5-minute TTL).</li>
            <li>Database credentials rotated every 30 days.</li>
            <li>All AI agent plugins run in isolated Wasmtime sandboxes.</li>
            <li>Penetration testing conducted before major releases.</li>
          </ul>
          <p>
            In the event of a data breach affecting your rights, we will notify you and the relevant
            supervisory authority within 72 hours of becoming aware of it.
          </p>
        </Section>

        <Section title="10. International Transfers">
          <p>
            Your data may be processed in countries outside the UAE or EU. Where we transfer
            personal data internationally, we ensure adequate protection via Standard Contractual
            Clauses (SCCs) or equivalent safeguards as required by applicable law.
          </p>
        </Section>

        <Section title="11. Children">
          <p>
            The Platform is not directed at children under 18. We do not knowingly collect personal
            data from children. If you believe a child has provided us with personal data, contact us
            at{" "}
            <a href="mailto:privacy@aistaffglobal.com" className="text-amber-400 hover:text-amber-300">
              privacy@aistaffglobal.com
            </a>{" "}
            and we will delete it promptly.
          </p>
        </Section>

        <Section title="12. Changes to This Policy">
          <p>
            We may update this Privacy Policy periodically. We will notify you of material changes
            by email or by a prominent notice on the Platform at least 14 days before they take
            effect. The "Last updated" date at the top of this page reflects the most recent revision.
          </p>
        </Section>

        <Section title="13. Contact and Complaints">
          <p>
            For privacy questions or to exercise your rights:{" "}
            <a href="mailto:privacy@aistaffglobal.com" className="text-amber-400 hover:text-amber-300">
              privacy@aistaffglobal.com
            </a>
          </p>
          <p>
            If you are in the EU and believe we have not adequately addressed your concern, you have
            the right to lodge a complaint with your local data protection supervisory authority.
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
