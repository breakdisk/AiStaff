'use client'
import { useEffect, useState } from 'react'
import { fetchDeploymentMilestones, MilestoneStatus } from '@/lib/api'
import { MilestonePanel } from './MilestonePanel'
import { Session } from 'next-auth'

interface StoredEngagement {
  deploymentId: string
  jobTitle: string
  counterpartyEmail: string
}

interface Props { session: Session }

export default function EngagementsClient({ session }: Props) {
  const profileId = (session.user as any)?.profileId as string ?? ''
  const role = ((session.user as any)?.role ?? 'talent') as 'talent' | 'client'

  const [engagements, setEngagements] = useState<StoredEngagement[]>([])
  const [milestones, setMilestones] = useState<Record<string, MilestoneStatus[]>>({})
  const [loading, setLoading] = useState(true)

  const loadMilestones = async (deploymentId: string) => {
    try {
      const ms = await fetchDeploymentMilestones(deploymentId)
      setMilestones(prev => ({ ...prev, [deploymentId]: ms } as Record<string, MilestoneStatus[]>))
    } catch { /* silently skip */ }
  }

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('active_engagements') ?? '[]') as StoredEngagement[]
    setEngagements(stored)
    Promise.all(stored.map(e => loadMilestones(e.deploymentId))).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="h-40 animate-pulse rounded bg-zinc-800" />
  if (engagements.length === 0) return <p className="text-sm text-zinc-400">No active engagements.</p>

  return (
    <div className="space-y-6">
      {engagements.map(eng => (
        <div key={eng.deploymentId} className="rounded border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-zinc-50">{eng.jobTitle}</p>
            <p className="text-xs text-zinc-400">{eng.counterpartyEmail}</p>
            <p className="mt-1 font-mono text-xs text-zinc-600">{eng.deploymentId}</p>
          </div>
          <MilestonePanel
            deploymentId={eng.deploymentId}
            milestones={milestones[eng.deploymentId] ?? []}
            role={role}
            profileId={profileId}
            onUpdate={() => loadMilestones(eng.deploymentId)}
          />
        </div>
      ))}
    </div>
  )
}
