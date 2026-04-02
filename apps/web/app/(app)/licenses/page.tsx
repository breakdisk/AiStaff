"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Key } from "lucide-react";

interface License {
  id: string;
  listing_name: string;
  slug: string;
  jurisdiction: string;
  seats: number;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
}

function StatusBadge({ license }: { license: License }) {
  if (license.revoked_at) {
    return (
      <span className="rounded-sm border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] text-red-500">
        REVOKED
      </span>
    );
  }
  const now = Date.now();
  const expires = new Date(license.expires_at).getTime();
  if (expires < now) {
    return (
      <span className="rounded-sm border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] text-red-500">
        EXPIRED
      </span>
    );
  }
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  if (expires - now < thirtyDays) {
    return (
      <span className="rounded-sm border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-400">
        EXPIRING SOON
      </span>
    );
  }
  return (
    <span className="rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-500">
      ACTIVE
    </span>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function LicensesPage() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/licenses/mine")
      .then((r) => r.json() as Promise<License[]>)
      .then(setLicenses)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Key className="w-5 h-5 text-amber-400" />
          <h1 className="text-lg font-mono font-semibold text-zinc-50">Licenses</h1>
          {!loading && (
            <span className="font-mono text-xs text-zinc-500">({licenses.length})</span>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse rounded-sm border border-zinc-800 bg-zinc-900 p-4 space-y-2">
                <div className="h-4 w-1/2 rounded bg-zinc-800" />
                <div className="h-3 w-1/3 rounded bg-zinc-800" />
              </div>
            ))}
          </div>
        ) : licenses.length === 0 ? (
          <div className="rounded-sm border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="font-mono text-sm text-zinc-400">
              No active licenses. Licenses are issued when you purchase agent access.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-sm border border-zinc-800 overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-zinc-900">
                  <tr>
                    {["Agent", "Jurisdiction", "Seats", "Issued", "Expires", "Status"].map((h) => (
                      <th key={h} className="px-4 py-2.5 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {licenses.map((l, i) => (
                    <tr key={l.id} className={i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/50"}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/marketplace/${l.slug}`}
                          className="font-mono text-xs text-amber-400 hover:underline"
                        >
                          {l.listing_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-sm border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300 uppercase">
                          {l.jurisdiction}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-300">{l.seats}</td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-400">{fmtDate(l.issued_at)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-400">{fmtDate(l.expires_at)}</td>
                      <td className="px-4 py-3"><StatusBadge license={l} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {licenses.map((l) => (
                <div key={l.id} className="rounded-sm border border-zinc-800 bg-zinc-900 p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/marketplace/${l.slug}`}
                      className="font-mono text-sm font-medium text-amber-400 hover:underline"
                    >
                      {l.listing_name}
                    </Link>
                    <StatusBadge license={l} />
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs text-zinc-400">
                    <span className="uppercase border border-zinc-700 rounded-sm px-1.5 py-0.5 text-[10px] text-zinc-300">
                      {l.jurisdiction}
                    </span>
                    <span>{l.seats} seat{l.seats !== 1 ? "s" : ""}</span>
                  </div>
                  <p className="font-mono text-[10px] text-zinc-600">
                    Issued {fmtDate(l.issued_at)} · Expires {fmtDate(l.expires_at)}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
