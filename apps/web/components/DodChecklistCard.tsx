"use client";

import { CheckCircle, XCircle, Clock } from "lucide-react";

interface Step {
  step_id:     string;
  step_label:  string;
  passed:      boolean;
  notes?:      string;
}

interface DodChecklistCardProps {
  deploymentId: string;
  steps:        Step[];
  finalized:    boolean;
  allPassed:    boolean;
}

const REQUIRED_STEPS = [
  "env_preflight_passed",
  "license_validated",
  "wasm_hash_verified",
  "network_egress_configured",
  "smoke_test_passed",
  "client_acceptance_signed",
];

export default function DodChecklistCard({
  deploymentId,
  steps,
  finalized,
  allPassed,
}: DodChecklistCardProps) {
  const completedIds = steps.map((s) => s.step_id);
  const passedCount  = steps.filter((s) => s.passed).length;

  return (
    <div className="border border-zinc-800 bg-zinc-950 p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">
          Installation DoD
        </span>
        <span className="font-mono text-xs text-zinc-500">
          {passedCount}/{REQUIRED_STEPS.length}
        </span>
      </div>

      {/* Step rows */}
      <ul className="space-y-1">
        {REQUIRED_STEPS.map((id) => {
          const step      = steps.find((s) => s.step_id === id);
          const completed = completedIds.includes(id);

          return (
            <li
              key={id}
              className="flex items-center gap-2 h-8 px-1 border-b border-zinc-900 last:border-0"
            >
              {completed ? (
                step?.passed ? (
                  <CheckCircle size={14} className="text-green-500 shrink-0" />
                ) : (
                  <XCircle size={14} className="text-red-500 shrink-0" />
                )
              ) : (
                <Clock size={14} className="text-zinc-600 shrink-0" />
              )}
              <span className="text-xs text-zinc-300 truncate flex-1">
                {step?.step_label ?? id.replace(/_/g, " ")}
              </span>
              {step?.notes && (
                <span className="text-xs text-zinc-600 truncate max-w-24" title={step.notes}>
                  {step.notes}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {/* Finalized banner */}
      {finalized && (
        <div
          className={`mt-2 px-2 py-1 text-xs font-semibold text-center ${
            allPassed
              ? "bg-green-950 text-green-400"
              : "bg-red-950 text-red-400"
          }`}
        >
          {allPassed ? "CHECKLIST PASSED" : "CHECKLIST FAILED"}
        </div>
      )}
    </div>
  );
}
