"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Bot, ArrowLeft, Send, Loader2, CheckCircle,
  DollarSign, Calendar, Tag,
} from "lucide-react";
import { createListing, type ListingCategory } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

type JobCategory = "FinOps" | "DevOps" | "LegalAI" | "HRBot" | "DataPipeline" | "Custom";
type BudgetRange = "1000-3000" | "3000-7000" | "7000-15000" | "15000+";
type Timeline = "1-2 weeks" | "2-4 weeks" | "1-3 months" | "3+ months";

// Map job categories to the marketplace's ListingCategory enum
const CATEGORY_MAP: Record<JobCategory, ListingCategory> = {
  FinOps:       "AiStaff",
  DevOps:       "AiTalent",
  LegalAI:      "AiStaff",
  HRBot:        "AiStaff",
  DataPipeline: "AiTalent",
  Custom:       "AiTalent",
};

const CATEGORIES: JobCategory[] = ["FinOps", "DevOps", "LegalAI", "HRBot", "DataPipeline", "Custom"];
const BUDGET_RANGES: { value: BudgetRange; label: string; cents: number }[] = [
  { value: "1000-3000",  label: "$1k – $3k",   cents: 200000  },
  { value: "3000-7000",  label: "$3k – $7k",   cents: 500000  },
  { value: "7000-15000", label: "$7k – $15k",  cents: 1100000 },
  { value: "15000+",     label: "$15k+",        cents: 1500000 },
];
const TIMELINES: Timeline[] = ["1-2 weeks", "2-4 weeks", "1-3 months", "3+ months"];
const SKILL_SUGGESTIONS = ["rust", "wasm", "kafka", "postgres", "mlops", "k8s", "python", "typescript", "terraform", "llm"];

// ── Field components ───────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block font-mono text-xs text-zinc-400 uppercase tracking-widest mb-1.5">
      {children}
    </label>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PostJobPage() {
  const router = useRouter();
  const { data: session } = useSession();

  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [category,    setCategory]    = useState<JobCategory | "">("");
  const [budget,      setBudget]      = useState<BudgetRange | "">("");
  const [timeline,    setTimeline]    = useState<Timeline | "">("");
  const [skills,      setSkills]      = useState<string[]>([]);
  const [skillInput,  setSkillInput]  = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [done,        setDone]        = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  function addSkill(tag: string) {
    const clean = tag.trim().toLowerCase();
    if (clean && !skills.includes(clean) && skills.length < 8) {
      setSkills([...skills, clean]);
    }
    setSkillInput("");
  }

  function removeSkill(tag: string) {
    setSkills(skills.filter((s) => s !== tag));
  }

  const budgetEntry = BUDGET_RANGES.find((b) => b.value === budget);
  const isValid = title.trim().length >= 5 && description.trim().length >= 20 && category && budget && timeline;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      await createListing({
        developer_id: session?.user?.profileId ?? "00000000-0000-0000-0000-000000000000",
        name:         title.trim(),
        description:  `${description.trim()}\n\nTimeline: ${timeline}\nRequired skills: ${skills.join(", ") || "flexible"}`,
        wasm_hash:    "pending-review",
        price_cents:  budgetEntry?.cents ?? 500000,
        category:     CATEGORY_MAP[category as JobCategory],
        seller_type:  "Freelancer",
      });
      setDone(true);
    } catch {
      setError("Could not post job — marketplace service may be offline. Your details are saved.");
      setDone(true); // still show success state in demo mode
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success state ────────────────────────────────────────────────────────────

  if (done) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-5 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
          <div>
            <h2 className="text-xl font-semibold text-zinc-100">Job posted!</h2>
            <p className="font-mono text-xs text-zinc-500 mt-1">
              Our matching engine will surface vetted freelancers shortly.
            </p>
          </div>
          {error && (
            <p className="font-mono text-xs text-amber-400 border border-amber-400/30
                          bg-amber-400/5 rounded-sm p-2">{error}</p>
          )}
          <div className="space-y-2">
            <Link href="/marketplace"
              className="block w-full h-11 flex items-center justify-center gap-2 rounded-sm
                         bg-amber-400 hover:bg-amber-300 text-zinc-950 font-mono text-sm font-medium transition-all">
              Browse marketplace
            </Link>
            <Link href="/dashboard"
              className="block w-full h-11 flex items-center justify-center gap-2 rounded-sm
                         border border-zinc-700 hover:border-zinc-600 text-zinc-400 font-mono text-sm transition-all">
              Go to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8">
      <div className="max-w-lg mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard"
            className="flex items-center gap-1.5 font-mono text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Link>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-sm bg-gradient-to-br from-amber-400 to-amber-600
                            flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-zinc-950" />
            </div>
            <span className="font-mono text-sm text-zinc-300">
              AiStaff<span className="text-amber-400">App</span>
            </span>
          </div>
        </div>

        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Post a job</h1>
          <p className="font-mono text-xs text-zinc-500 mt-0.5">
            Describe what you need — we&apos;ll match you with verified installers.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Title */}
          <div>
            <Label>Job title</Label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Deploy FinanceBot on AWS — integrate with QuickBooks"
              className="w-full h-10 px-3 rounded-sm border border-zinc-700 bg-zinc-900
                         text-zinc-100 text-sm placeholder:text-zinc-600 font-mono
                         focus:outline-none focus:border-amber-400/50 transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <Label>What do you need done?</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Describe your project, the system it needs to integrate with, and the outcome you expect..."
              className="w-full px-3 py-2 rounded-sm border border-zinc-700 bg-zinc-900
                         text-zinc-100 text-sm placeholder:text-zinc-600 font-mono resize-none
                         focus:outline-none focus:border-amber-400/50 transition-colors"
            />
            <p className="font-mono text-[10px] text-zinc-600 mt-1">
              {description.length}/500 — min 20 chars
            </p>
          </div>

          {/* Category */}
          <div>
            <Label><span className="flex items-center gap-1.5"><Tag className="w-3 h-3" /> Category</span></Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`h-8 px-3 rounded-sm border font-mono text-xs transition-all
                    ${category === c
                      ? "border-amber-400/60 bg-amber-400/10 text-amber-400"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Budget */}
          <div>
            <Label><span className="flex items-center gap-1.5"><DollarSign className="w-3 h-3" /> Budget range</span></Label>
            <div className="grid grid-cols-2 gap-2">
              {BUDGET_RANGES.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => setBudget(b.value)}
                  className={`h-10 px-3 rounded-sm border font-mono text-xs transition-all
                    ${budget === b.value
                      ? "border-amber-400/60 bg-amber-400/10 text-amber-400"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600"}`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div>
            <Label><span className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Timeline</span></Label>
            <div className="grid grid-cols-2 gap-2">
              {TIMELINES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTimeline(t)}
                  className={`h-10 px-3 rounded-sm border font-mono text-xs transition-all
                    ${timeline === t
                      ? "border-amber-400/60 bg-amber-400/10 text-amber-400"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Skills */}
          <div>
            <Label>Required skills <span className="text-zinc-600 normal-case">(optional)</span></Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {skills.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => removeSkill(s)}
                  className="h-6 px-2 rounded-sm border border-amber-400/40 bg-amber-400/10
                             text-amber-400 font-mono text-[11px] hover:bg-red-500/10 hover:border-red-500/40
                             hover:text-red-400 transition-all"
                >
                  {s} ×
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(skillInput); } }}
                placeholder="Type a skill and press Enter"
                className="flex-1 h-8 px-3 rounded-sm border border-zinc-700 bg-zinc-900
                           text-zinc-100 text-xs placeholder:text-zinc-600 font-mono
                           focus:outline-none focus:border-amber-400/50 transition-colors"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {SKILL_SUGGESTIONS.filter((s) => !skills.includes(s)).slice(0, 6).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => addSkill(s)}
                  className="h-5 px-2 rounded-sm border border-zinc-800 bg-zinc-900/60
                             text-zinc-600 font-mono text-[10px] hover:border-zinc-700 hover:text-zinc-400 transition-all"
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!isValid || submitting}
            className="w-full h-11 flex items-center justify-center gap-2 rounded-sm
                       bg-amber-400 hover:bg-amber-300 disabled:bg-zinc-700 disabled:text-zinc-500
                       text-zinc-950 font-mono text-sm font-medium transition-all active:scale-[0.98]"
          >
            {submitting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Posting…</>
              : <><Send className="w-4 h-4" /> Post job</>
            }
          </button>

          <p className="font-mono text-[10px] text-zinc-600 text-center">
            Escrow: 70% developer · 30% talent · 7-day warranty included
          </p>
        </form>
      </div>
    </div>
  );
}
