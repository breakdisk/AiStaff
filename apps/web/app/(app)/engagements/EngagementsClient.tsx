'use client'
import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { fetchDeploymentMilestones, MilestoneStatus } from '@/lib/api'
import { MilestonePanel } from './MilestonePanel'

interface Engagement {
  deployment_id: string
  listing_id: string
  job_title: string
  counterparty_email: string
  state: string
  escrow_amount_cents: number
  created_at: string
  my_role: 'talent' | 'client'
}

function StateBadge({ state }: { state: string }) {
  const colors: Record<string, string> = {
    VETO_WINDOW:        'bg-amber-400/10 text-amber-400 border-amber-400/30',
    BIOMETRIC_PENDING:  'bg-blue-500/10 text-blue-400 border-blue-500/30',
    ACTIVE:             'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    COMPLETED:          'bg-zinc-700/50 text-zinc-300 border-zinc-600',
  }
  const cls = colors[state] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'
  return (
    <span className={`rounded-sm border px-1.5 py-0.5 font-mono text-xs ${cls}`}>
      {state.replace(/_/g, ' ')}
    </span>
  )
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
        >
          <Star
            className={`w-5 h-5 transition-colors ${
              n <= (hovered || value) ? 'fill-amber-400 text-amber-400' : 'text-zinc-600'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

function ReviewForm({
  deploymentId,
  listingId,
  onDone,
}: {
  deploymentId: string
  listingId: string
  onDone: () => void
}) {
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (rating === 0) { setError('Select a star rating.'); return }
    setError(null)
    setSubmitting(true)
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deployment_id: deploymentId, listing_id: listingId, rating, body }),
    })
    setSubmitting(false)
    if (res.status === 409) { setError('You already reviewed this deployment.'); return }
    if (!res.ok) { setError('Failed to submit review.'); return }
    onDone()
  }

  return (
    <div className="mt-3 p-3 rounded-sm border border-zinc-700 bg-zinc-950 space-y-3">
      <p className="font-mono text-xs text-zinc-400">Rate this engagement</p>
      <StarPicker value={rating} onChange={setRating} />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Optional: describe your experience…"
        rows={2}
        className="w-full rounded-sm border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-50 placeholder-zinc-600 focus:border-amber-400 focus:outline-none resize-none"
      />
      {error && <p className="font-mono text-xs text-red-500">{error}</p>}
      <button
        onClick={submit}
        disabled={submitting}
        className="px-3 py-1.5 bg-amber-400 text-zinc-950 font-mono text-xs font-semibold rounded-sm hover:bg-amber-300 disabled:opacity-50 transition-colors"
      >
        {submitting ? 'Submitting…' : 'Submit Review'}
      </button>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-sm border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div className="h-4 w-2/3 rounded bg-zinc-800" />
      <div className="h-3 w-1/3 rounded bg-zinc-800" />
      <div className="h-3 w-1/2 rounded bg-zinc-800" />
    </div>
  )
}

export default function EngagementsClient() {
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [milestones, setMilestones] = useState<Record<string, MilestoneStatus[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set())

  const loadMilestones = async (deploymentId: string) => {
    try {
      const ms = await fetchDeploymentMilestones(deploymentId)
      setMilestones(prev => ({ ...prev, [deploymentId]: ms }))
    } catch { /* silently skip — milestone service may be unavailable */ }
  }

  useEffect(() => {
    fetch('/api/freelancer/engagements')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<Engagement[]>
      })
      .then(data => {
        setEngagements(data)
        return Promise.all(data.map(e => loadMilestones(e.deployment_id)))
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load engagements'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-red-500" role="alert">{error}</p>
  }

  if (engagements.length === 0) {
    return <p className="text-sm text-zinc-400">No active engagements.</p>
  }

  return (
    <div className="space-y-6">
      {engagements.map(eng => (
        <div key={eng.deployment_id} className="rounded-sm border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-zinc-50">{eng.job_title}</p>
              <p className="text-xs text-zinc-400">{eng.counterparty_email}</p>
              <p className="mt-1 font-mono text-xs text-zinc-600">{eng.deployment_id}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <StateBadge state={eng.state} />
              <span className="font-mono text-xs text-zinc-400">
                ${(eng.escrow_amount_cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} escrow
              </span>
            </div>
          </div>

          <MilestonePanel
            deploymentId={eng.deployment_id}
            milestones={milestones[eng.deployment_id] ?? []}
            role={eng.my_role}
            profileId=""
            onUpdate={() => loadMilestones(eng.deployment_id)}
          />

          {/* Review section — only for completed client engagements */}
          {eng.state === 'COMPLETED' && eng.my_role === 'client' && (
            <div className="pt-2 border-t border-zinc-800">
              {reviewedIds.has(eng.deployment_id) ? (
                <p className="font-mono text-xs text-emerald-500">Review submitted ✓</p>
              ) : reviewingId === eng.deployment_id ? (
                <ReviewForm
                  deploymentId={eng.deployment_id}
                  listingId={eng.listing_id}
                  onDone={() => {
                    setReviewingId(null)
                    setReviewedIds(prev => new Set([...prev, eng.deployment_id]))
                  }}
                />
              ) : (
                <button
                  onClick={() => setReviewingId(eng.deployment_id)}
                  className="inline-flex items-center gap-1.5 font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  <Star className="w-3.5 h-3.5" />
                  Leave a Review
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
