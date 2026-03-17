'use client'
import { useState } from 'react'
import { Plus, X } from 'lucide-react'

interface Props {
  onConfirm: (milestones: string[], escrowCents: number) => void
  onCancel: () => void
  loading: boolean
}

export function MilestoneForm({ onConfirm, onCancel, loading }: Props) {
  const [milestones, setMilestones] = useState<string[]>([''])
  const [budget, setBudget] = useState('')

  const add = () => setMilestones(m => [...m, ''])
  const remove = (i: number) => setMilestones(m => m.filter((_, idx) => idx !== i))
  const update = (i: number, val: string) =>
    setMilestones(m => m.map((s, idx) => (idx === i ? val : s)))

  const handleSubmit = () => {
    const clean = milestones.map(m => m.trim()).filter(Boolean)
    if (clean.length === 0) return
    const cents = Math.round(parseFloat(budget || '0') * 100)
    onConfirm(clean, cents)
  }

  return (
    <div className="space-y-4 rounded border border-zinc-700 bg-zinc-950 p-4">
      <h3 className="text-sm font-semibold text-zinc-50">Define Milestones</h3>
      <div className="space-y-2">
        {milestones.map((m, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={m}
              onChange={e => update(i, e.target.value)}
              placeholder={`Milestone ${i + 1}`}
              className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
            />
            {milestones.length > 1 && (
              <button onClick={() => remove(i)} aria-label="Remove milestone" className="text-zinc-500 hover:text-red-400">
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
      <button onClick={add} className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300">
        <Plus size={14} /> Add milestone
      </button>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Escrow Amount (USD)</label>
        <input
          type="number"
          value={budget}
          onChange={e => setBudget(e.target.value)}
          placeholder="0.00"
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex-1 rounded bg-amber-400 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
        >
          {loading ? 'Locking escrow…' : 'Hire & Lock Escrow'}
        </button>
        <button onClick={onCancel} className="rounded border border-zinc-700 px-4 py-2 text-xs text-zinc-400 hover:text-zinc-50">
          Cancel
        </button>
      </div>
    </div>
  )
}
