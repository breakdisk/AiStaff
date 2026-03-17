import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'

const CHECKLIST = process.env.CHECKLIST_SERVICE_URL ?? 'http://localhost:3003'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ deploymentId: string; stepId: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { deploymentId, stepId } = await params
  const body = await req.json()
  const res = await fetch(
    `${CHECKLIST}/checklist/${deploymentId}/step/${stepId}/submit`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  )
  return new NextResponse(null, { status: res.status })
}
