import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? 'http://localhost:3002'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ listingId: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { listingId } = await params
  const res = await fetch(`${MARKETPLACE}/listings/${listingId}/proposals`)
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
