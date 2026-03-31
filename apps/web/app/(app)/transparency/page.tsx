'use client'
import { useEffect, useState } from 'react'
import {
  Eye,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Factor {
  id: string
  category: string
  label: string
  yourValue: string
  required: string
  status: 'pass' | 'fail' | 'partial'
  weight: number
  gap?: string
  tip: string
}

interface MissedJob {
  id: string
  title: string
  client: string
  budget: string
  postedAt: string
  yourScore: number
  topScore: number
  factors: Factor[]
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-sm border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div className="flex justify-between">
        <div className="h-4 w-1/2 rounded bg-zinc-800" />
        <div className="h-4 w-16 rounded bg-zinc-800" />
      </div>
      <div className="h-3 w-1/3 rounded bg-zinc-800" />
      <div className="h-3 w-full rounded bg-zinc-800" />
      <div className="h-3 w-3/4 rounded bg-zinc-800" />
    </div>
  )
}

function StatusIcon({ status }: { status: Factor['status'] }) {
  if (status === 'pass')    return <CheckCircle    size={14} className="shrink-0 text-emerald-500" />
  if (status === 'fail')    return <XCircle        size={14} className="shrink-0 text-red-500"     />
  return                           <AlertTriangle  size={14} className="shrink-0 text-amber-400"   />
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-xs text-zinc-400">{label}</span>
        <span className="font-mono text-xs text-zinc-300">{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-zinc-800">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  )
}

function FactorRow({ factor }: { factor: Factor }) {
  return (
    <div className="border-t border-zinc-800 pt-2.5 space-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <StatusIcon status={factor.status} />
          <span className="text-xs text-zinc-200 truncate">{factor.label}</span>
          <span className="shrink-0 rounded-sm bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-zinc-400">
            {factor.weight}%
          </span>
        </div>
        <div className="shrink-0 text-right">
          <span className="font-mono text-xs text-zinc-300">{factor.yourValue}</span>
          <span className="mx-1 text-zinc-600">→</span>
          <span className="font-mono text-xs text-zinc-500">{factor.required}</span>
        </div>
      </div>
      {factor.gap && (
        <p className={`ml-5 text-xs ${factor.status === 'fail' ? 'text-red-400' : 'text-amber-400'}`}>
          {factor.gap}
        </p>
      )}
      <p className="ml-5 text-xs text-zinc-500">{factor.tip}</p>
    </div>
  )
}

function MissedJobCard({ job }: { job: MissedJob }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-900">
      {/* Header */}
      <button
        className="w-full text-left p-4"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-label={`Toggle details for ${job.title}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-50 truncate">{job.title}</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {job.client} · {job.postedAt}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono text-sm text-zinc-300">{job.budget}</span>
            {expanded
              ? <ChevronUp size={14} className="text-zinc-500" />
              : <ChevronDown size={14} className="text-zinc-500" />
            }
          </div>
        </div>

        {/* Score comparison */}
        <div className="mt-3 flex gap-4">
          <ScoreBar label="Your score" value={job.yourScore} color="bg-amber-400" />
          <ScoreBar label="Top score"  value={job.topScore}  color="bg-emerald-500" />
        </div>
      </button>

      {/* Expandable factors */}
      {expanded && (
        <div className="px-4 pb-4 space-y-0">
          {job.factors.map(f => (
            <FactorRow key={f.id} factor={f} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Summary banner ────────────────────────────────────────────────────────────

function SummaryBanner({ jobs }: { jobs: MissedJob[] }) {
  // Count failing factors by label across all jobs
  const failCount: Record<string, number> = {}
  jobs.forEach(job => {
    job.factors.forEach(f => {
      if (f.status !== 'pass') {
        failCount[f.label] = (failCount[f.label] ?? 0) + 1
      }
    })
  })
  const topGaps = Object.entries(failCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([label]) => label)

  return (
    <div className="rounded-sm border border-amber-400/20 bg-amber-400/5 px-4 py-3">
      <p className="text-xs text-zinc-300">
        <span className="font-semibold text-amber-400">{jobs.length} job{jobs.length !== 1 ? 's' : ''} analyzed</span>
        {topGaps.length > 0 && (
          <>
            {' · Top gaps: '}
            <span className="text-zinc-200">{topGaps.join(', ')}</span>
          </>
        )}
      </p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TransparencyPage() {
  const [jobs, setJobs] = useState<MissedJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/transparency/missed-jobs')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<MissedJob[]>
      })
      .then(setJobs)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <main className="flex-1 bg-zinc-950 text-zinc-50 pb-20 lg:pb-0">
      <div className="mx-auto max-w-3xl px-4 py-8">

        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Eye size={20} className="shrink-0 text-amber-400" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-semibold text-zinc-50">Transparency Report</h1>
            <p className="text-sm text-zinc-400">
              Jobs you weren&apos;t top-ranked for — and why.
            </p>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <p className="text-sm text-red-500" role="alert">{error}</p>
        )}

        {/* Empty state */}
        {!loading && !error && jobs.length === 0 && (
          <div className="flex items-center gap-3 rounded-sm border border-zinc-800 bg-zinc-900 px-4 py-6">
            <CheckCircle size={20} className="shrink-0 text-emerald-500" aria-hidden="true" />
            <p className="text-sm text-zinc-300">
              No missed jobs on record. You&apos;re getting matched!
            </p>
          </div>
        )}

        {/* Data */}
        {!loading && !error && jobs.length > 0 && (
          <div className="space-y-4">
            <SummaryBanner jobs={jobs} />
            {jobs.map(job => (
              <MissedJobCard key={job.id} job={job} />
            ))}
          </div>
        )}

      </div>
    </main>
  )
}
