"use client";

import { Key, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

interface LicenseKeyCardProps {
  licenseId:   string;
  jurisdiction: string;
  seats:       number;
  expiresAt:   string; // ISO 8601
  revoked:     boolean;
}

function daysUntil(isoDate: string): number {
  const diff = new Date(isoDate).getTime() - Date.now();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export default function LicenseKeyCard({
  licenseId,
  jurisdiction,
  seats,
  expiresAt,
  revoked,
}: LicenseKeyCardProps) {
  const [days, setDays] = useState(daysUntil(expiresAt));

  useEffect(() => {
    const interval = setInterval(() => setDays(daysUntil(expiresAt)), 60_000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const expiringSoon = days <= 30 && !revoked;
  const expired      = days === 0 && !revoked;

  const borderColor = revoked
    ? "border-red-800"
    : expiringSoon
    ? "border-amber-600"
    : "border-zinc-800";

  return (
    <div className={`border ${borderColor} bg-zinc-950 p-3`}>
      <div className="flex items-center gap-2 mb-2">
        <Key size={14} className="text-zinc-400 shrink-0" />
        <span className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">
          License
        </span>
        {(expiringSoon || revoked) && (
          <AlertTriangle size={12} className="text-amber-400 ml-auto" />
        )}
      </div>

      {/* License ID */}
      <div className="font-mono text-xs text-zinc-300 truncate mb-2" title={licenseId}>
        {licenseId.slice(0, 8)}…{licenseId.slice(-4)}
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <span className="text-zinc-500">Jurisdiction</span>
        <span className="font-mono text-zinc-300">{jurisdiction.toUpperCase()}</span>

        <span className="text-zinc-500">Seats</span>
        <span className="font-mono text-zinc-300">{seats}</span>

        <span className="text-zinc-500">Expires</span>
        <span
          className={`font-mono ${
            expired ? "text-red-400" : expiringSoon ? "text-amber-400" : "text-zinc-300"
          }`}
        >
          {expired ? "EXPIRED" : `${days}d`}
        </span>

        <span className="text-zinc-500">Status</span>
        <span
          className={`font-mono font-semibold ${
            revoked ? "text-red-400" : "text-green-400"
          }`}
        >
          {revoked ? "REVOKED" : "ACTIVE"}
        </span>
      </div>
    </div>
  );
}
