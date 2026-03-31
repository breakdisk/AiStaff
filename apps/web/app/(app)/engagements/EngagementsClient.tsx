'use client'
import { useEffect, useState } from 'react'
import { fetchDeploymentMilestones, MilestoneStatus } from '@/lib/api'
import { MilestonePanel } from './MilestonePanel'

interface Engagement {
  deployment_id: string
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
  }
  const cls = colors[state] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'
  return (
    <span className={`rounded-sm border px-1.5 py-0.5 font-mono text-xs ${cls}`}>
      {state.replace(/_/g, ' ')}
    </span>
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
        </div>
      ))}
    </div>
  )
}
