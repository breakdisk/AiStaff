import Link from "next/link";

export const metadata = {
  title: "Data Deletion Instructions — AiStaff",
  description: "How to request deletion of your AiStaff account data and Facebook-connected information.",
  openGraph: {
    title: "Data Deletion Instructions — AiStaff",
    description: "How to request deletion of your AiStaff account data and Facebook-connected information.",
    url: "https://aistaffglobal.com/data-deletion",
    siteName: "AiStaff",
    type: "website",
    images: [{ url: "https://aistaffglobal.com/api/og", width: 1200, height: 630, alt: "AiStaff" }],
  },
};

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center">
          <img src="/logo.png" alt="AiStaff" className="h-8 w-auto" />
        </Link>
        <div className="flex items-center gap-4 font-mono text-xs text-zinc-500">
          <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms of Service</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Data Deletion Instructions</h1>
          <p className="font-mono text-xs text-zinc-500 mt-1">
            How to remove your AiStaff account and associated data
          </p>
        </div>

        {/* Facebook callout */}
        <div className="rounded-sm border border-amber-400/20 bg-amber-400/5 p-4 space-y-2">
          <p className="text-sm font-medium text-amber-400">Facebook Login Users</p>
          <p className="text-sm text-zinc-400">
            If you used Facebook to sign in to AiStaff, you can revoke AiStaff's access from your
            Facebook account settings at any time. This stops Facebook from sharing new data with
            AiStaff. To also delete the data AiStaff holds, follow the steps below.
          </p>
          <a
            href="https://www.facebook.com/settings?tab=applications"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors mt-1"
          >
            Facebook App Settings → Remove AiStaff ↗
          </a>
        </div>

        {/* Steps */}
        <section className="space-y-6">
          <h2 className="text-base font-semibold text-zinc-100 border-b border-zinc-800 pb-2">
            How to Delete Your Data
          </h2>

          <div className="space-y-4">
            <Step number={1} title="Option A — Self-service account deletion">
              <p>
                If you have an active AiStaff account, sign in and go to{" "}
                <strong className="text-zinc-200">Profile → Settings → Delete Account</strong>.
                This will pseudonymise your profile data and remove your personal information.
                Financial transaction records are retained for legal compliance as described in
                our{" "}
                <Link href="/privacy#6" className="text-amber-400 hover:text-amber-300">
                  Privacy Policy §6
                </Link>.
              </p>
            </Step>

            <Step number={2} title="Option B — Email request">
              <p>Send a deletion request to:</p>
              <a
                href="mailto:privacy@aistaffglobal.com?subject=Data Deletion Request"
                className="block font-mono text-sm text-amber-400 hover:text-amber-300 transition-colors mt-1"
              >
                privacy@aistaffglobal.com
              </a>
              <p className="mt-2">
                Include in your email:
              </p>
              <ul className="pl-4 list-disc space-y-1 text-zinc-400 marker:text-zinc-600 text-sm mt-1">
                <li>The email address associated with your AiStaff account.</li>
                <li>The OAuth provider you used to sign in (Facebook, Google, GitHub, or LinkedIn).</li>
                <li>A brief description of what data you want deleted.</li>
              </ul>
            </Step>

            <Step number={3} title="What happens next">
              <ul className="pl-4 list-disc space-y-1.5 text-zinc-400 marker:text-zinc-600 text-sm">
                <li>We will acknowledge your request within <strong className="text-zinc-200">5 business days</strong>.</li>
                <li>We will complete the deletion within <strong className="text-zinc-200">30 days</strong> of your verified request.</li>
                <li>You will receive a confirmation email once deletion is complete.</li>
                <li>
                  Financial transaction records (escrow history, payouts) are exempt from deletion
                  as required by law, but will be pseudonymised — your name and email will be
                  removed and replaced with an anonymous identifier.
                </li>
                <li>
                  Append-only audit logs (tool call audit, escrow audit) cannot be individually
                  deleted, but contain no raw personal data beyond your platform user ID.
                </li>
              </ul>
            </Step>
          </div>
        </section>

        {/* What data we hold */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-zinc-100 border-b border-zinc-800 pb-2">
            What Data We Hold
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-mono border-collapse">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-2 pr-4 text-zinc-400 font-medium">Data type</th>
                  <th className="text-left py-2 pr-4 text-zinc-400 font-medium">Deletable?</th>
                  <th className="text-left py-2 text-zinc-400 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {[
                  ["Name & email", "Yes", "Removed on account deletion"],
                  ["OAuth provider IDs", "Yes", "Unlinked and nulled"],
                  ["Skills & profile", "Yes", "Removed on account deletion"],
                  ["ZK biometric commitment", "Yes", "Hash deleted — no raw data ever stored"],
                  ["Financial records", "Partial", "Pseudonymised — required by law for 7 years"],
                  ["Audit logs", "No", "Append-only compliance requirement; no raw PII"],
                  ["Contract hashes", "No", "SHA-256 hashes only; no document content"],
                ].map(([type, deletable, notes]) => (
                  <tr key={type}>
                    <td className="py-2 pr-4 text-zinc-300">{type}</td>
                    <td className={`py-2 pr-4 font-medium ${
                      deletable === "Yes" ? "text-emerald-400" :
                      deletable === "Partial" ? "text-amber-400" : "text-red-400"
                    }`}>{deletable}</td>
                    <td className="py-2 text-zinc-500">{notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-sm text-zinc-500">
          For more information about how we handle your data, see our{" "}
          <Link href="/privacy" className="text-amber-400 hover:text-amber-300">Privacy Policy</Link>.
          For general questions, contact{" "}
          <a href="mailto:privacy@aistaffglobal.com" className="text-amber-400 hover:text-amber-300">
            privacy@aistaffglobal.com
          </a>.
        </p>
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

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-7 h-7 rounded-sm bg-amber-400/10 border border-amber-400/20 flex items-center justify-center font-mono text-xs text-amber-400 font-medium">
        {number}
      </div>
      <div className="space-y-2 text-sm text-zinc-400 leading-relaxed">
        <p className="font-medium text-zinc-200">{title}</p>
        {children}
      </div>
    </div>
  );
}
