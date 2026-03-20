"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Landmark, FileText, Globe,
  ChevronDown, ChevronUp, CheckCircle, XCircle, AlertTriangle,
  Info, DollarSign, Percent, FileCheck
} from "lucide-react";
import { AppSidebar, AppMobileNav } from "@/components/AppSidebar";

// ── Types ─────────────────────────────────────────────────────────────────────
type ClassificationResult = "employee" | "contractor" | "borderline";
type TaxRegion = "US" | "UK" | "EU" | "AU" | "CA";

interface TaxRule {
  region:     TaxRegion;
  flag:       string;
  formName:   string;
  threshold:  string;
  vatGst:     string;
  selfEmpTax: string;
  notes:      string;
}

interface ClassQuestion {
  id:      string;
  label:   string;
  hint:    string;
  yesEmployee: boolean; // true = yes answer points to employee
}

// ── Data ──────────────────────────────────────────────────────────────────────
const TAX_RULES: TaxRule[] = [
  { region: "US", flag: "🇺🇸", formName: "1099-NEC", threshold: "$600 / year",  vatGst: "No federal VAT",       selfEmpTax: "15.3% (SE tax)", notes: "Platform issues 1099-NEC for US contractors above threshold. Quarterly estimated taxes due Apr / Jun / Sep / Jan." },
  { region: "UK", flag: "🇬🇧", formName: "SA100",    threshold: "£1,000 / year",vatGst: "20% VAT if >£90k",    selfEmpTax: "9–12% NI Class 4", notes: "Self Assessment due 31 Jan. IR35 determines PAYE status for intermediaries. Check HMRC CEST." },
  { region: "EU", flag: "🇪🇺", formName: "Varies",   threshold: "Varies by state",vatGst: "20–27% VAT",         selfEmpTax: "Varies by state", notes: "EU VAT OSS scheme for cross-border B2C services. Reverse charge applies to B2B within EU." },
  { region: "AU", flag: "🇦🇺", formName: "TFN / ABN",threshold: "A$0 (all income)", vatGst: "10% GST if >A$75k", selfEmpTax: "Medicare levy 2%", notes: "ABN required for independent contractors. Super guarantee does not apply for genuine contractors." },
  { region: "CA", flag: "🇨🇦", formName: "T4A",      threshold: "CA$500 / year",vatGst: "5% GST / HST varies", selfEmpTax: "9.9% CPP (self)", notes: "T4A issued for non-employment income. HST rate depends on province (13–15% in ON/NS/NB)." },
];

const CLASS_QUESTIONS: ClassQuestion[] = [
  { id: "q1", label: "Does the client control how you do your work (not just what you deliver)?",      hint: "Employee control = direction over methods, hours, tools.",     yesEmployee: true  },
  { id: "q2", label: "Are you restricted from working for other clients simultaneously?",               hint: "Exclusivity clauses often indicate employee status.",           yesEmployee: true  },
  { id: "q3", label: "Does the client provide your tools, software, and equipment?",                    hint: "Contractors typically use their own tools.",                    yesEmployee: true  },
  { id: "q4", label: "Is the engagement indefinite / open-ended with no fixed end date?",               hint: "A defined project scope with end date suggests contracting.",  yesEmployee: true  },
  { id: "q5", label: "Do you bear financial risk if the project fails or is delayed?",                  hint: "Risk of loss is a key contractor marker.",                      yesEmployee: false },
  { id: "q6", label: "Do you have the right to substitute another person to perform the work?",         hint: "Substitution right = strong contractor indicator.",             yesEmployee: false },
  { id: "q7", label: "Do you advertise your services to multiple clients publicly?",                    hint: "Operating as a business in the market = contractor signal.",    yesEmployee: false },
  { id: "q8", label: "Is your payment tied to deliverables or milestones (not hours worked)?",          hint: "Output-based pay = contractor; time-based pay = employee.",    yesEmployee: false },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function scoreToResult(employeeScore: number, total: number): ClassificationResult {
  const ratio = employeeScore / total;
  if (ratio >= 0.6) return "employee";
  if (ratio <= 0.35) return "contractor";
  return "borderline";
}

const RESULT_CONFIG: Record<ClassificationResult, { label: string; color: string; border: string; icon: React.ElementType; msg: string }> = {
  employee:   { label: "Likely Employee",      color: "text-red-400",   border: "border-red-800",   icon: XCircle,        msg: "Your answers suggest an employment relationship. The client may have PAYE / withholding obligations. Review with a tax adviser before proceeding." },
  contractor: { label: "Likely Contractor",    color: "text-green-400", border: "border-green-800", icon: CheckCircle,    msg: "Your answers suggest an independent contractor relationship. Ensure you have a signed ICA and issue invoices for each payment." },
  borderline: { label: "Borderline — Review",  color: "text-amber-400", border: "border-amber-800", icon: AlertTriangle,  msg: "Your answers are mixed. Some factors point to employment, others to contracting. A legal or tax adviser should review before work begins." },
};

// ── Sub-components ────────────────────────────────────────────────────────────
function TaxCard({ rule }: { rule: TaxRule }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border rounded-sm bg-zinc-900/40 ${open ? "border-zinc-700" : "border-zinc-800"}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={(e) => e.key === "Enter" && setOpen(v => !v)}
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-zinc-900/60 transition-colors"
      >
        <span className="text-xl">{rule.flag}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-zinc-100">{rule.region}</span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 border border-zinc-700 rounded-sm text-zinc-400">{rule.formName}</span>
          </div>
          <p className="font-mono text-xs text-zinc-500 mt-0.5">{rule.notes.slice(0, 60)}…</p>
        </div>
        <div className="flex-shrink-0 grid grid-cols-2 gap-x-4 text-right mr-2">
          <div>
            <p className="font-mono text-[9px] text-zinc-600 uppercase">Threshold</p>
            <p className="font-mono text-xs text-zinc-300">{rule.threshold}</p>
          </div>
          <div>
            <p className="font-mono text-[9px] text-zinc-600 uppercase">VAT/GST</p>
            <p className="font-mono text-xs text-zinc-300">{rule.vatGst.split(" ")[0]}</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />}
      </div>
      {open && (
        <div className="border-t border-zinc-800 px-3 py-3 space-y-2.5 bg-zinc-950/40">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Reporting Form", value: rule.formName },
              { label: "Income Threshold", value: rule.threshold },
              { label: "VAT / GST", value: rule.vatGst },
              { label: "Self-Emp Tax", value: rule.selfEmpTax },
            ].map(({ label, value }) => (
              <div key={label} className="border border-zinc-800 rounded-sm p-2 bg-zinc-900">
                <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">{label}</p>
                <p className="font-mono text-xs text-zinc-200 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-sky-400 flex-shrink-0 mt-0.5" />
            <p className="font-mono text-xs text-zinc-400 leading-relaxed">{rule.notes}</p>
          </div>
          <div className="flex gap-2">
            <a href="#" className="h-7 px-2 border border-zinc-700 rounded-sm font-mono text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors flex items-center gap-1.5">
              <FileCheck className="w-3 h-3" /> Official guidance
            </a>
            <Link href="/legal-toolkit" className="h-7 px-2 border border-zinc-700 rounded-sm font-mono text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors flex items-center gap-1.5">
              <FileText className="w-3 h-3" /> Get ICA template
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TaxEnginePage() {
  const [tab, setTab] = useState<"tax" | "classify">("tax");
  const [answers, setAnswers] = useState<Record<string, boolean | null>>(
    Object.fromEntries(CLASS_QUESTIONS.map(q => [q.id, null]))
  );
  const [showResult, setShowResult] = useState(false);

  const answered    = Object.values(answers).filter(v => v !== null).length;
  const empScore    = CLASS_QUESTIONS.filter(q => {
    const a = answers[q.id];
    return a !== null && ((q.yesEmployee && a === true) || (!q.yesEmployee && a === false));
  }).length;
  const result = showResult ? scoreToResult(empScore, answered || 1) : null;
  const ResultIcon = result ? RESULT_CONFIG[result].icon : null;

  function reset() {
    setAnswers(Object.fromEntries(CLASS_QUESTIONS.map(q => [q.id, null])));
    setShowResult(false);
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <AppSidebar />

      {/* Main */}
      <main className="flex-1 min-w-0 px-4 sm:px-6 py-6 pb-24 sm:pb-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Landmark className="w-4 h-4 text-amber-400" />
              <h1 className="font-mono text-base font-medium text-zinc-100">Tax &amp; Classification Engine</h1>
            </div>
            <p className="font-mono text-xs text-zinc-500">Regional tax guidance · contractor vs. employee classification checks</p>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="border border-amber-900/50 bg-amber-950/20 rounded-sm px-3 py-2.5 mb-5 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="font-mono text-xs text-amber-300/80">
            This tool provides <span className="text-amber-300 font-medium">general guidance only</span> — not tax or legal advice.
            Consult a qualified tax professional for your specific situation.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800 mb-5">
          {[
            { key: "tax"      as const, label: "Tax Rules by Region" },
            { key: "classify" as const, label: "Classification Check" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-2 font-mono text-xs border-b-2 transition-colors ${
                tab === key ? "border-amber-500 text-amber-400" : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >{label}</button>
          ))}
        </div>

        {/* Tax rules tab */}
        {tab === "tax" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {[
                { icon: Globe,       label: "Regions covered",    value: "5" },
                { icon: FileText,    label: "Tax forms tracked",  value: "6" },
                { icon: Percent,     label: "VAT regimes",        value: "4" },
                { icon: DollarSign,  label: "SE tax rates",       value: "5" },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="border border-zinc-800 rounded-sm p-2.5 bg-zinc-900/40 flex items-center gap-2.5">
                  <Icon className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                  <div>
                    <p className="font-mono text-xs font-medium text-zinc-200">{value}</p>
                    <p className="font-mono text-[10px] text-zinc-600">{label}</p>
                  </div>
                </div>
              ))}
            </div>
            {TAX_RULES.map(r => <TaxCard key={r.region} rule={r} />)}
          </div>
        )}

        {/* Classification tab */}
        {tab === "classify" && (
          <div className="space-y-4">
            <div className="border border-zinc-800 rounded-sm px-3 py-2.5 bg-zinc-900/30 flex items-start gap-2.5 mb-2">
              <Info className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
              <p className="font-mono text-xs text-zinc-400">
                Answer the questions below about your current engagement. The tool will estimate whether your relationship resembles employment or independent contracting under common multi-factor tests (IRS 20-factor, IR35, etc.).
              </p>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-2 mb-1">
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 transition-all duration-300 rounded-full"
                  style={{ width: `${(answered / CLASS_QUESTIONS.length) * 100}%` }} />
              </div>
              <span className="font-mono text-xs text-zinc-500 flex-shrink-0">{answered}/{CLASS_QUESTIONS.length}</span>
            </div>

            {/* Questions */}
            <div className="space-y-2">
              {CLASS_QUESTIONS.map((q, i) => (
                <div key={q.id} className={`border rounded-sm p-3 transition-colors ${
                  answers[q.id] !== null ? "border-zinc-700 bg-zinc-900/60" : "border-zinc-800 bg-zinc-900/30"
                }`}>
                  <div className="flex items-start gap-2 mb-2">
                    <span className="font-mono text-[10px] text-zinc-600 flex-shrink-0 mt-0.5">Q{i + 1}</span>
                    <div>
                      <p className="font-mono text-xs text-zinc-200">{q.label}</p>
                      <p className="font-mono text-[11px] text-zinc-600 mt-0.5">{q.hint}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-5">
                    {[
                      { val: true,  label: "Yes" },
                      { val: false, label: "No"  },
                    ].map(({ val, label }) => (
                      <button key={String(val)}
                        onClick={() => { setAnswers(p => ({ ...p, [q.id]: val })); setShowResult(false); }}
                        className={`h-7 px-3 rounded-sm font-mono text-xs border transition-colors ${
                          answers[q.id] === val
                            ? val ? "bg-sky-900/40 border-sky-700 text-sky-300" : "bg-zinc-700 border-zinc-600 text-zinc-200"
                            : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                        }`}
                      >{label}</button>
                    ))}
                    {answers[q.id] !== null && (
                      <button onClick={() => { setAnswers(p => ({ ...p, [q.id]: null })); setShowResult(false); }}
                        className="h-7 px-2 font-mono text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors">
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Run check */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowResult(true)}
                disabled={answered < 4}
                className="h-9 px-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 font-mono text-xs rounded-sm transition-colors"
              >
                Run Classification Check {answered < 4 && `(${4 - answered} more needed)`}
              </button>
              {answered > 0 && (
                <button onClick={reset} className="h-9 px-3 border border-zinc-700 font-mono text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 rounded-sm transition-colors">
                  Reset
                </button>
              )}
            </div>

            {/* Result */}
            {showResult && result && ResultIcon && (
              <div className={`border rounded-sm p-4 ${RESULT_CONFIG[result].border}`}>
                <div className="flex items-center gap-2 mb-2">
                  <ResultIcon className={`w-5 h-5 ${RESULT_CONFIG[result].color}`} />
                  <span className={`font-mono text-sm font-medium ${RESULT_CONFIG[result].color}`}>
                    {RESULT_CONFIG[result].label}
                  </span>
                  <span className="font-mono text-xs text-zinc-600 ml-auto">
                    {empScore}/{answered} factors suggest employment
                  </span>
                </div>
                <p className="font-mono text-xs text-zinc-400 leading-relaxed">{RESULT_CONFIG[result].msg}</p>
                <div className="flex gap-2 mt-3">
                  <Link href="/legal-toolkit" className="h-7 px-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-mono text-xs rounded-sm transition-colors flex items-center gap-1.5">
                    <FileText className="w-3 h-3" /> Get ICA Template
                  </Link>
                  <a href="#" className="h-7 px-3 border border-zinc-700 font-mono text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 rounded-sm transition-colors flex items-center gap-1.5">
                    <FileCheck className="w-3 h-3" /> HMRC CEST Tool
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <AppMobileNav />
    </div>
  );
}
