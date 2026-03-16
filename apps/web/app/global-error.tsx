"use client";

/**
 * Catches unhandled errors during page rendering.
 * Shows the actual error message so we can diagnose the "Server Error" after OAuth.
 * TODO: Remove or replace with a production error page before launch.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
        <div className="max-w-lg w-full space-y-4">
          <h1 className="text-xl font-semibold text-red-400">
            Something went wrong
          </h1>

          <div className="rounded border border-zinc-800 bg-zinc-900 p-4 space-y-2">
            <p className="text-sm text-zinc-300 font-mono break-all">
              {error.message || "Unknown error"}
            </p>
            {error.digest && (
              <p className="text-xs text-zinc-500 font-mono">
                Digest: {error.digest}
              </p>
            )}
            <p className="text-xs text-zinc-600 font-mono break-all">
              {error.stack?.split("\n").slice(0, 5).join("\n")}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => reset()}
              className="px-4 py-2 text-sm rounded border border-zinc-700 bg-zinc-800
                         hover:bg-zinc-700 text-zinc-200 transition-colors"
            >
              Try again
            </button>
            <a
              href="/dashboard"
              className="px-4 py-2 text-sm rounded border border-zinc-700 bg-zinc-800
                         hover:bg-zinc-700 text-zinc-200 transition-colors"
            >
              Go to Dashboard
            </a>
            <a
              href="/login"
              className="px-4 py-2 text-sm rounded border border-zinc-700 bg-zinc-800
                         hover:bg-zinc-700 text-zinc-200 transition-colors"
            >
              Back to Login
            </a>
          </div>

          <p className="text-[10px] text-zinc-600 font-mono">
            URL: {typeof window !== "undefined" ? window.location.href : "SSR"}
          </p>
        </div>
      </body>
    </html>
  );
}
