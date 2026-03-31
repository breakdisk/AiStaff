"use client";

import { useEffect, useState, useMemo } from "react";
import { Briefcase, Search, X } from "lucide-react";
import { useSession } from "next-auth/react";
import type { JobRow } from "@/app/api/freelancer/jobs/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskEmail(email: string | null): string {
  if (!email) return "—";
  const at = email.indexOf("@");
  if (at < 0) return email.slice(0, 3) + "@…";
  return email.slice(0, Math.min(3, at)) + "@…";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function fmtBudget(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString("en-US")}`;
}

type SortKey = "newest" | "budget_desc" | "proposals_desc";

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="border border-zinc-800 rounded-sm p-4 bg-zinc-900/40 space-y-3 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="h-3 w-52 bg-zinc-800 rounded-sm" />
        <div className="h-4 w-16 bg-zinc-800 rounded-sm" />
      </div>
      <div className="h-2.5 w-24 bg-zinc-800 rounded-sm" />
      <div className="flex gap-2">
        {[1, 2, 3].map(i => <div key={i} className="h-4 w-14 bg-zinc-800 rounded-sm" />)}
      </div>
      <div className="flex items-center justify-between">
        <div className="h-2.5 w-20 bg-zinc-800 rounded-sm" />
        <div className="h-7 w-28 bg-zinc-800 rounded-sm" />
      </div>
    </div>
  );
}

// ── Job card ──────────────────────────────────────────────────────────────────

function JobCard({
  job,
  profileId,
  applied,
  onApply,
}: {
  job: JobRow;
  profileId: string | undefined;
  applied: boolean;
  onApply: (id: string) => void;
}) {
  const [pending, setPending] = useState(false);

  async function handleApply() {
    if (!profileId || applied || pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/marketplace/express-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_id: job.id, applicant_id: profileId }),
      });
      if (res.ok) onApply(job.id);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="border border-zinc-800 rounded-sm p-4 bg-zinc-900/40 space-y-2.5">
      {/* Title + category */}
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-xs font-medium text-zinc-100 leading-tight">{job.name}</p>
        <span className="flex-shrink-0 font-mono text-[9px] border border-zinc-700 text-zinc-500 px-1.5 py-0.5 rounded-sm uppercase">
          {job.category ?? "AiTalent"}
        </span>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[10px] text-zinc-500">
          Client: <span className="text-zinc-400">{maskEmail(job.poster_email)}</span>
        </span>
        <span className="font-mono text-[10px] text-amber-400 font-medium">
          {fmtBudget(job.price_cents)}
        </span>
        <span className="font-mono text-[10px] text-zinc-600">
          {job.proposal_count} proposal{job.proposal_count === 1 ? "" : "s"}
        </span>
      </div>

      {/* Skill chips */}
      {job.required_skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {job.required_skills.map(tag => (
            <span
              key={tag}
              className="font-mono text-[10px] border border-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-sm"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <p className="font-mono text-[10px] text-zinc-600">{relativeTime(job.created_at)}</p>
        <button
          onClick={handleApply}
          disabled={applied || pending || !profileId}
          className={`h-7 px-3 rounded-sm font-mono text-[10px] uppercase tracking-widest border transition-colors ${
            applied
              ? "border-emerald-800 text-emerald-400 bg-emerald-950/30 cursor-default"
              : pending
              ? "border-zinc-700 text-zinc-500 cursor-wait"
              : "border-amber-800 text-amber-400 bg-amber-950/20 hover:border-amber-600 hover:bg-amber-950/40"
          }`}
        >
          {applied ? "Applied ✓" : pending ? "Applying…" : "Express Interest →"}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JobFeedPage() {
  const { data: session } = useSession();
  const profileId = (session?.user as { profileId?: string })?.profileId;

  const [jobs,    setJobs]    = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const [search,       setSearch]       = useState("");
  const [activeSkills, setActiveSkills] = useState<Set<string>>(new Set());
  const [sort,         setSort]         = useState<SortKey>("newest");
  const [applied,      setApplied]      = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/freelancer/jobs")
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<JobRow[]>;
      })
      .then(setJobs)
      .catch(e => setError(e.message ?? "Failed to load jobs"))
      .finally(() => setLoading(false));
  }, []);

  const allSkills = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach(j => j.required_skills.forEach(s => set.add(s)));
    return [...set].sort();
  }, [jobs]);

  const filtered = useMemo(() => {
    let result = jobs;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        j =>
          j.name.toLowerCase().includes(q) ||
          (j.description ?? "").toLowerCase().includes(q),
      );
    }

    if (activeSkills.size > 0) {
      result = result.filter(j =>
        [...activeSkills].every(s => j.required_skills.includes(s)),
      );
    }

    if (sort === "budget_desc") {
      result = [...result].sort((a, b) => b.price_cents - a.price_cents);
    } else if (sort === "proposals_desc") {
      result = [...result].sort((a, b) => b.proposal_count - a.proposal_count);
    }

    return result;
  }, [jobs, search, activeSkills, sort]);

  const totalBudget = jobs.reduce((s, j) => s + j.price_cents, 0);

  function toggleSkill(skill: string) {
    setActiveSkills(prev => {
      const next = new Set(prev);
      if (next.has(skill)) next.delete(skill);
      else next.add(skill);
      return next;
    });
  }

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "newest",        label: "Newest"          },
    { key: "budget_desc",   label: "Highest Budget"  },
    { key: "proposals_desc",label: "Most Proposals"  },
  ];

  return (
    <main className="flex-1 pb-20 lg:pb-0 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Briefcase className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <div>
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
              Job Feed
            </h1>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">
              Open roles posted by clients
            </p>
          </div>
        </div>
        {!loading && !error && (
          <p className="font-mono text-[10px] text-zinc-600 mt-3">
            {jobs.length} open role{jobs.length === 1 ? "" : "s"} · {fmtBudget(totalBudget)} total budget
          </p>
        )}
      </div>

      {/* Search + sort bar */}
      <div className="px-4 py-2.5 border-b border-zinc-800 space-y-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search jobs…"
            className="w-full h-8 pl-7 pr-8 bg-zinc-900 border border-zinc-800 rounded-sm
                       font-mono text-xs text-zinc-300 placeholder:text-zinc-600
                       focus:outline-none focus:border-zinc-600"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[10px] text-zinc-600 mr-1">Sort:</span>
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`font-mono text-[10px] px-2 py-0.5 rounded-sm border transition-colors ${
                sort === key
                  ? "border-zinc-600 text-zinc-300"
                  : "border-zinc-800 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Skill filter chips */}
      {allSkills.length > 0 && (
        <div className="px-4 py-2 border-b border-zinc-800 flex flex-wrap gap-1.5">
          {allSkills.map(skill => (
            <button
              key={skill}
              onClick={() => toggleSkill(skill)}
              className={`font-mono text-[10px] px-2 py-0.5 rounded-sm border transition-colors ${
                activeSkills.has(skill)
                  ? "border-amber-800 bg-amber-950/40 text-amber-400"
                  : "border-zinc-800 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400"
              }`}
            >
              {skill}
            </button>
          ))}
        </div>
      )}

      {/* Job list */}
      <div className="p-4 space-y-3">
        {loading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {!loading && error && (
          <p className="font-mono text-xs text-red-400 text-center py-8">{error}</p>
        )}

        {!loading && !error && filtered.length === 0 && (
          <p className="font-mono text-xs text-zinc-500 text-center py-10">
            No open jobs right now. Check back soon.
          </p>
        )}

        {!loading && !error && filtered.map(job => (
          <JobCard
            key={job.id}
            job={job}
            profileId={profileId}
            applied={applied.has(job.id)}
            onApply={id => setApplied(prev => new Set([...prev, id]))}
          />
        ))}
      </div>
    </main>
  );
}
