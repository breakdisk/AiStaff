'use client'
import { useState } from 'react'
import { CheckCircle, XCircle, Clock } from 'lucide-react'
import { Proposal, acceptProposal, rejectProposal, AcceptProposalResponse } from '@/lib/api'
import { MilestoneForm } from './MilestoneForm'

interface Props {
  proposal: Proposal
  onUpdate: (result?: AcceptProposalResponse) => void
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  PENDING:  <Clock size={12} />,
  ACCEPTED: <CheckCircle size={12} />,
  REJECTED: <XCircle size={12} />,
}
const STATUS_COLOR: Record<string, string> = {
  PENDING:  'text-zinc-400',
  ACCEPTED: 'text-emerald-500',
  REJECTED: 'text-red-500',
}

export function ProposalCard({ proposal, onUpdate }: Props) {
  const [showMilestones, setShowMilestones] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAccept = async (milestones: string[], escrowCents: number) => {
    setLoading(true)
    setError(null)
    try {
      const result = await acceptProposal(proposal.id, {
        transaction_id: crypto.randomUUID(),
        escrow_amount_cents: escrowCents,
        milestones,
      })
      const stored = JSON.parse(localStorage.getItem('active_engagements') ?? '[]')
      stored.push({
        deploymentId: result.deployment_id,
        jobTitle: proposal.job_title,
        counterpartyEmail: proposal.freelancer_email,
      })
      localStorage.setItem('active_engagements', JSON.stringify(stored))
      setShowMilestones(false)
      onUpdate(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to accept proposal')
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    setLoading(true)
    setError(null)
    try {
      await rejectProposal(proposal.id, 'Not the right fit at this time')
      onUpdate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reject')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-50">{proposal.freelancer_email}</p>
          <p className="text-xs text-zinc-400 mt-0.5">{proposal.job_title}</p>
        </div>
        <span className={`flex items-center gap-1 text-xs font-mono ${STATUS_COLOR[proposal.status] ?? 'text-zinc-400'}`}>
          {STATUS_ICON[proposal.status]}
          {proposal.status}
        </span>
      </div>
      {proposal.cover_letter && (
        <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">{proposal.cover_letter}</p>
      )}
      <div className="flex gap-4 text-xs text-zinc-500">
        {proposal.proposed_budget && <span>Budget: {proposal.proposed_budget}</span>}
        {proposal.proposed_timeline && <span>Timeline: {proposal.proposed_timeline}</span>}
      </div>
      {error && <p className="text-xs text-red-500" role="alert">{error}</p>}
      {proposal.status === 'PENDING' && !showMilestones && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => setShowMilestones(true)}
            className="flex-1 rounded bg-amber-400 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-300"
          >
            Accept &amp; Define Milestones
          </button>
          <button
            onClick={handleReject}
            disabled={loading}
            className="rounded border border-zinc-700 px-4 py-2 text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
      {showMilestones && (
        <MilestoneForm
          onConfirm={handleAccept}
          onCancel={() => setShowMilestones(false)}
          loading={loading}
        />
      )}
    </div>
  )
}
