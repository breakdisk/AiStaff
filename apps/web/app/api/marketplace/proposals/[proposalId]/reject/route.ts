import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? 'http://localhost:3002'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ proposalId: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { proposalId } = await params
  const body = await req.json()
  const res = await fetch(`${MARKETPLACE}/proposals/${proposalId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return new NextResponse(null, { status: res.status })
}
