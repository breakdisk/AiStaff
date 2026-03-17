import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'

const CHECKLIST = process.env.CHECKLIST_SERVICE_URL ?? 'http://localhost:3003'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ deploymentId: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { deploymentId } = await params
  const res = await fetch(`${CHECKLIST}/checklist/${deploymentId}/milestones`)
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
