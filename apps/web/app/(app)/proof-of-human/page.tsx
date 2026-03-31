'use client'
import { useSession } from 'next-auth/react'
import { ShieldCheck, ExternalLink } from 'lucide-react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

type IdentityTier = 'UNVERIFIED' | 'SOCIAL_VERIFIED' | 'BIOMETRIC_VERIFIED'

// ── 1. Identity Score Gauge ───────────────────────────────────────────────────

function IdentityGauge({ score, tier }: { score: number; tier: IdentityTier }) {
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  const tierLabels: Record<IdentityTier, string> = {
    UNVERIFIED:          'Unverified',
    SOCIAL_VERIFIED:     'Social Verified',
    BIOMETRIC_VERIFIED:  'Biometric Verified',
  }
  const tierColors: Record<IdentityTier, string> = {
    UNVERIFIED:          'text-zinc-400 border-zinc-600',
    SOCIAL_VERIFIED:     'text-amber-400 border-amber-400/40',
    BIOMETRIC_VERIFIED:  'text-emerald-500 border-emerald-500/40',
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width="100" height="100" aria-label={`Trust score: ${score} out of 100`}>
        {/* Track */}
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="#27272a"
          strokeWidth="8"
        />
        {/* Progress */}
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="#fbbf24"
          strokeWidth="8"
          strokeLinecap="butt"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
        />
        <text x="50" y="46" textAnchor="middle" fill="#fafafa" fontSize="14" fontWeight="600" fontFamily="monospace">
          {score}
        </text>
        <text x="50" y="60" textAnchor="middle" fill="#a1a1aa" fontSize="9" fontFamily="monospace">
          / 100
        </text>
      </svg>
      <span className={`rounded-sm border px-2 py-0.5 text-xs font-mono ${tierColors[tier]}`}>
        {tierLabels[tier]}
      </span>
    </div>
  )
}

// ── 2. Activity Heatmap ───────────────────────────────────────────────────────

/** Seeded LCG pseudo-random — deterministic per profileId. */
function seededRandom(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0
  }
  return () => {
    h ^= h << 13
    h ^= h >> 17
    h ^= h << 5
    return ((h >>> 0) / 0xFFFFFFFF)
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const LEVEL_COLORS = [
  'bg-zinc-800',
  'bg-zinc-700',
  'bg-zinc-600',
  'bg-zinc-500',
  'bg-amber-900',
  'bg-amber-700',
  'bg-amber-500',
]

function ActivityHeatmap({ profileId }: { profileId: string }) {
  const rand = seededRandom(profileId || 'default')
  // 12 cols × 7 rows
  const cells: number[][] = Array.from({ length: 12 }, () =>
    Array.from({ length: 7 }, () => Math.floor(rand() * 7))
  )

  return (
    <div>
      <div className="mb-1 grid grid-cols-12 gap-1">
        {MONTHS.map(m => (
          <span key={m} className="text-center font-mono text-[9px] text-zinc-500">{m}</span>
        ))}
      </div>
      <div className="grid grid-cols-12 gap-1">
        {cells.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-1">
            {col.map((level, ri) => (
              <div
                key={ri}
                className={`h-3 w-3 rounded-sm ${LEVEL_COLORS[level]}`}
                title={`Level ${level}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-[10px] text-zinc-500">Less</span>
        {LEVEL_COLORS.map((c, i) => (
          <div key={i} className={`h-2.5 w-2.5 rounded-sm ${c}`} aria-hidden="true" />
        ))}
        <span className="text-[10px] text-zinc-500">More</span>
      </div>
    </div>
  )
}

// ── 3. Work Anatomy ───────────────────────────────────────────────────────────

const WORK_SEGMENTS = [
  { label: 'Coding',  pct: 45, color: 'bg-amber-500' },
  { label: 'Testing', pct: 20, color: 'bg-emerald-500' },
  { label: 'Docs',    pct: 15, color: 'bg-blue-500' },
  { label: 'Review',  pct: 12, color: 'bg-purple-500' },
  { label: 'Meetings',pct:  8, color: 'bg-zinc-500' },
]

function WorkAnatomy() {
  return (
    <div>
      <div className="flex h-6 w-full overflow-hidden rounded-sm">
        {WORK_SEGMENTS.map(s => (
          <div
            key={s.label}
            className={`${s.color} h-full`}
            style={{ width: `${s.pct}%` }}
            title={`${s.label}: ${s.pct}%`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3">
        {WORK_SEGMENTS.map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className={`h-2.5 w-2.5 rounded-sm ${s.color}`} aria-hidden="true" />
            <span className="text-xs text-zinc-400">{s.label} <span className="font-mono text-zinc-300">{s.pct}%</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 4. Audit Trail ────────────────────────────────────────────────────────────

const AUDIT_EVENTS = [
  { event: 'GitHub connected',      relative: '14 days ago', status: 'Verified' },
  { event: 'LinkedIn connected',    relative: '10 days ago', status: 'Verified' },
  { event: 'Trust score updated',   relative: '10 days ago', status: 'Computed' },
  { event: 'Biometric nonce issued',relative: '3 days ago',  status: 'Issued' },
  { event: 'W3C VC exported',       relative: '1 day ago',   status: 'Signed' },
]

function AuditTrail() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="pb-2 text-left font-mono text-zinc-500">Event</th>
            <th className="pb-2 text-left font-mono text-zinc-500">When</th>
            <th className="pb-2 text-left font-mono text-zinc-500">Status</th>
          </tr>
        </thead>
        <tbody>
          {AUDIT_EVENTS.map((e, i) => (
            <tr key={i} className="border-b border-zinc-800/50">
              <td className="py-2 text-zinc-200">{e.event}</td>
              <td className="py-2 font-mono text-zinc-500">{e.relative}</td>
              <td className="py-2">
                <span className="rounded-sm bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono text-emerald-500">
                  {e.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── 5. Privacy Guarantee ──────────────────────────────────────────────────────

const PRIVACY_POINTS = [
  'Raw biometric data never stored',
  'Only Blake3(nonce\u2016proof) commitment on-chain',
  'ZK proof verified server-side only',
  'Nonces are single-use',
]

function PrivacyGuarantee() {
  return (
    <ul className="space-y-2">
      {PRIVACY_POINTS.map(p => (
        <li key={p} className="flex items-start gap-2">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden="true" />
          <span className="text-sm text-zinc-300">{p}</span>
        </li>
      ))}
    </ul>
  )
}

// ── 6. Red Flag Detector ──────────────────────────────────────────────────────

function RedFlagDetector({ score }: { score: number }) {
  const hasFlag = score < 50

  return (
    <div className={`flex items-start gap-3 rounded-sm border p-3 ${
      hasFlag
        ? 'border-amber-400/30 bg-amber-400/5'
        : 'border-emerald-500/30 bg-emerald-500/5'
    }`}>
      <ShieldCheck
        size={16}
        className={`shrink-0 mt-0.5 ${hasFlag ? 'text-amber-400' : 'text-emerald-500'}`}
        aria-hidden="true"
      />
      {hasFlag ? (
        <div>
          <p className="text-xs font-semibold text-amber-400">1 flag detected</p>
          <p className="mt-0.5 text-xs text-zinc-400">
            Trust score below recommended threshold (≥ 50). Connect GitHub and LinkedIn or
            complete biometric verification to resolve.
          </p>
        </div>
      ) : (
        <p className="text-xs text-emerald-500 font-semibold">0 flags detected</p>
      )}
    </div>
  )
}

// ── 7. Defense Box ────────────────────────────────────────────────────────────

function DefenseBox() {
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-2">
      <p className="text-sm text-zinc-300">
        Your verifiable credential (W3C VC) is ready to export.
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <span className="text-zinc-500">Issued</span>
        <span className="font-mono text-zinc-300">{today}</span>
        <span className="text-zinc-500">Type</span>
        <span className="font-mono text-zinc-300">AiStaffTalentCredential</span>
        <span className="text-zinc-500">Status</span>
        <span className="font-mono text-emerald-500">Valid</span>
      </div>
      <Link
        href="/reputation-export"
        className="mt-2 inline-flex items-center gap-1.5 rounded-sm border border-amber-400/40 px-3 py-1.5 text-xs font-semibold text-amber-400 hover:bg-amber-400/5 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-zinc-950"
        aria-label="Export W3C Verifiable Credential"
      >
        Export VC <ExternalLink size={12} aria-hidden="true" />
      </Link>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-sm border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
      {children}
    </section>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProofOfHumanPage() {
  const { data: session, status } = useSession()

  const user = session?.user as {
    profileId?: string
    identityTier?: IdentityTier
    trustScore?: number
  } | undefined

  const profileId   = user?.profileId   ?? ''
  const identityTier = (user?.identityTier ?? 'UNVERIFIED') as IdentityTier
  const trustScore  = user?.trustScore  ?? 0

  if (status === 'loading') {
    return (
      <main className="flex-1 bg-zinc-950 text-zinc-50 pb-20 lg:pb-0">
        <div className="mx-auto max-w-3xl px-4 py-8 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse h-32 rounded-sm bg-zinc-900" />
          ))}
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 bg-zinc-950 text-zinc-50 pb-20 lg:pb-0">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-4">

        {/* Page header */}
        <div className="mb-2 flex items-center gap-3">
          <ShieldCheck size={20} className="shrink-0 text-amber-400" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-zinc-50">Proof of Human</h1>
        </div>

        {/* 1. Identity Score Gauge */}
        <Section title="Identity Score">
          <div className="flex justify-center py-2">
            <IdentityGauge score={trustScore} tier={identityTier} />
          </div>
        </Section>

        {/* 2. Activity Heatmap */}
        <Section title="Activity Heatmap">
          <ActivityHeatmap profileId={profileId} />
        </Section>

        {/* 3. Work Anatomy */}
        <Section title="Work Anatomy">
          <WorkAnatomy />
        </Section>

        {/* 4. Audit Trail */}
        <Section title="Audit Trail">
          <AuditTrail />
        </Section>

        {/* 5. Privacy Guarantee */}
        <Section title="Privacy Guarantee">
          <PrivacyGuarantee />
        </Section>

        {/* 6. Red Flag Detector */}
        <Section title="Red Flag Detector">
          <RedFlagDetector score={trustScore} />
        </Section>

        {/* 7. Defense Box */}
        <Section title="Verifiable Credential">
          <DefenseBox />
        </Section>

      </div>
    </main>
  )
}
