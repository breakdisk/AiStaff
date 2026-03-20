'use client'
import { useEffect, useState } from 'react'
import { Proposal, AgentListing, fetchListings, fetchProposalsForJob } from '@/lib/api'
import { ProposalCard } from './ProposalCard'
import { Session } from 'next-auth'

interface Props { session: Session }

export default function ProposalsInboxClient({ session }: Props) {
  const profileId = (session.user as any)?.profileId as string | undefined
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!profileId) { setLoading(false); return }
    try {
      const { listings } = await fetchListings()
      const mine = (listings as AgentListing[]).filter((l: AgentListing) => (l as any).developer_id === profileId)
      const nested = await Promise.all(mine.map((l: AgentListing) => fetchProposalsForJob(l.id)))
      setProposals(nested.flat())
    } catch {
      // empty state on error
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [profileId])

  if (loading) return <div className="h-40 animate-pulse rounded bg-zinc-800" />
  if (proposals.length === 0) return <p className="text-sm text-zinc-400">No proposals received yet.</p>

  return (
    <div className="space-y-4">
      {proposals.map(p => (
        <ProposalCard key={p.id} proposal={p} onUpdate={() => load()} />
      ))}
    </div>
  )
}
