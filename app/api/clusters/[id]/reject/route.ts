import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// POST /api/clusters/[id]/reject
// Called by the founder to discard a pending cluster so it is not published.
//
// Auth: Bearer token must match ADMIN_SECRET env var.

function isAuthorised(req: NextRequest): boolean {
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  const secret = process.env.ADMIN_SECRET
  if (!token || !secret) return false
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  } catch {
    return false
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { id } = await params

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('clusters')
    .update({ status: 'discarded' })
    .eq('id', id)

  if (error) {
    console.error('Failed to reject cluster:', error.message)
    return NextResponse.json({ error: 'Failed to reject cluster' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
