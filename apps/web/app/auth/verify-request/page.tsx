export default function VerifyRequestPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="rounded-sm border border-zinc-800 bg-zinc-900/60 p-6 text-center space-y-3">
          <div className="w-10 h-10 rounded-sm bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mx-auto">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
          </div>
          <h1 className="font-semibold text-zinc-100 text-base">Check your email</h1>
          <p className="font-mono text-xs text-zinc-500">
            A sign-in link has been sent to your email address. It expires in 10 minutes.
          </p>
          <a href="/login" className="block font-mono text-xs text-zinc-400 hover:text-zinc-200 transition-colors pt-1">
            ← Back to sign in
          </a>
        </div>
      </div>
    </div>
  );
}
