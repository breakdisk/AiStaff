"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, Clock } from "lucide-react";

interface VetoCardProps {
  deploymentId:  string;
  agentName:     string;
  totalCents:    number;
  talentCents:   number;
  vetoWindowEnd: Date;
  onVeto:        (deploymentId: string, reason: string) => Promise<void>;
  onApprove:     (deploymentId: string) => Promise<void>;
}

type CardStatus = "window" | "approved" | "vetoed";

export function VetoCard({
  deploymentId,
  agentName,
  totalCents,
  talentCents,
  vetoWindowEnd,
  onVeto,
  onApprove,
}: VetoCardProps) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [status, setStatus] = useState<CardStatus>("window");

  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((vetoWindowEnd.getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(remaining);
      if (remaining === 0 && status === "window") {
        setStatus("approved");
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [vetoWindowEnd, status]);

  const fmtUSD = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
      cents / 100
    );

  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-950">
        <span className="font-mono text-xs text-zinc-500 uppercase tracking-widest">
          Veto Window
        </span>
        <span
          className={`font-mono text-sm tabular-nums font-medium flex items-center gap-1 ${
            secondsLeft <= 10 ? "text-amber-400" : "text-zinc-300"
          }`}
        >
          <Clock className="w-3 h-3" />
          {secondsLeft}s
        </span>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wide font-mono">Agent</p>
          <p className="font-mono text-sm text-zinc-100 mt-0.5">{agentName}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-2">
            <p className="text-xs text-zinc-500 font-mono">Your cut (30%)</p>
            <p className="font-mono text-base font-medium text-green-400 mt-0.5 tabular-nums">
              {fmtUSD(talentCents)}
            </p>
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-2">
            <p className="text-xs text-zinc-500 font-mono">Total</p>
            <p className="font-mono text-base font-medium text-zinc-300 mt-0.5 tabular-nums">
              {fmtUSD(totalCents)}
            </p>
          </div>
        </div>

        {/* Actions */}
        {status === "window" && (
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              onClick={async () => {
                await onVeto(deploymentId, "Talent-initiated veto");
                setStatus("vetoed");
              }}
              className="btn-veto sm:flex-1"
            >
              <AlertTriangle className="w-4 h-4" />
              VETO DEPLOYMENT
            </button>
            <button
              onClick={async () => {
                await onApprove(deploymentId);
                setStatus("approved");
              }}
              className="w-full sm:w-auto sm:flex-1 h-10 rounded-sm border border-zinc-700
                         text-zinc-400 font-mono text-xs uppercase tracking-widest
                         hover:border-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Silent Approve
            </button>
          </div>
        )}

        {status === "approved" && (
          <div className="flex items-center gap-2 text-green-400 text-sm font-mono py-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            Approved — biometric sign-off required
          </div>
        )}

        {status === "vetoed" && (
          <div className="flex items-center gap-2 text-red-400 text-sm font-mono py-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Vetoed — dispute opened
          </div>
        )}
      </div>
    </div>
  );
}
