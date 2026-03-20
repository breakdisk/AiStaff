'use client'
import { useState } from 'react'
import { CheckCircle, Clock, Upload } from 'lucide-react'
import { type MilestoneStatus, submitMilestone, approveMilestone } from '@/lib/api'

interface Props {
  deploymentId: string
  milestones: MilestoneStatus[]
  role: 'talent' | 'client'
  profileId: string
  onUpdate: () => void
}

export function MilestonePanel({ deploymentId, milestones, role, profileId, onUpdate }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (stepId: string) => {
    setLoading(stepId)
    setError(null)
    try {
      await submitMilestone(deploymentId, stepId, profileId, notes[stepId])
      onUpdate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setLoading(null)
    }
  }

  const handleApprove = async (stepId: string) => {
    setLoading(stepId)
    setError(null)
    try {
      await approveMilestone(deploymentId, stepId, profileId)
      onUpdate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-500" role="alert">{error}</p>}
      {milestones.length === 0 && <p className="text-xs text-zinc-500">No milestones yet.</p>}
      {milestones.map(m => (
        <div key={m.step_id} className="rounded border border-zinc-800 bg-zinc-900 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {m.passed ? (
                <CheckCircle size={14} className="shrink-0 text-emerald-500" />
              ) : m.submitted_at ? (
                <Clock size={14} className="shrink-0 text-amber-400" />
              ) : (
                <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-zinc-600" />
              )}
              <span className="text-sm text-zinc-50">{m.step_label}</span>
            </div>
            <span className="text-xs font-mono text-zinc-500">
              {m.passed ? 'Approved' : m.submitted_at ? 'Under review' : 'Pending'}
            </span>
          </div>
          {m.notes && <p className="ml-5 text-xs text-zinc-400">{m.notes}</p>}
          {role === 'talent' && !m.submitted_at && !m.passed && (
            <div className="ml-5 space-y-2">
              <input
                value={notes[m.step_id] ?? ''}
                onChange={e => setNotes(n => ({ ...n, [m.step_id]: e.target.value }))}
                placeholder="Deliverable link or notes…"
                aria-label={`Notes for ${m.step_label}`}
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-50 placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
              />
              <button
                onClick={() => handleSubmit(m.step_id)}
                disabled={loading === m.step_id}
                className="flex items-center gap-1 rounded bg-amber-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                <Upload size={12} /> Submit Work
              </button>
            </div>
          )}
          {role === 'client' && m.submitted_at && !m.passed && (
            <div className="ml-5">
              <button
                onClick={() => handleApprove(m.step_id)}
                disabled={loading === m.step_id}
                className="flex items-center gap-1 rounded bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                <CheckCircle size={12} /> Approve Milestone
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
