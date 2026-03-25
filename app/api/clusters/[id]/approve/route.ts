import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// POST /api/clusters/[id]/approve
// Called by the founder (via ntfy.sh deep-link or admin UI) to confirm a
// pending cluster and publish it to the live map as an alert.
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

  // Fetch cluster to get its display_radius
  const { data: cluster, error: fetchErr } = await supabase
    .from('clusters')
    .select('id, status, display_radius_metres')
    .eq('id', id)
    .single()

  if (fetchErr || !cluster) {
    return NextResponse.json({ error: 'Cluster not found' }, { status: 404 })
  }

  if (cluster.status === 'discarded') {
    return NextResponse.json({ error: 'Cannot approve a discarded cluster' }, { status: 409 })
  }

  // Update cluster status
  const { error: updateErr } = await supabase
    .from('clusters')
    .update({ status: 'auto_confirmed' })
    .eq('id', id)

  if (updateErr) {
    console.error('Failed to update cluster:', updateErr.message)
    return NextResponse.json({ error: 'Failed to approve cluster' }, { status: 500 })
  }

  // Create or re-confirm the alert (upsert on cluster_id)
  const { error: alertErr } = await supabase
    .from('alerts')
    .upsert(
      {
        cluster_id: id,
        confirmed_by: 'human',
        radius_metres: cluster.display_radius_metres,
      },
      { onConflict: 'cluster_id', ignoreDuplicates: false },
    )

  if (alertErr) {
    console.error('Failed to upsert alert:', alertErr.message)
    return NextResponse.json({ error: 'Failed to publish alert' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
