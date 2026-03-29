import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAuditLog } from '@/lib/admin/audit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { id } = await params
  const supabase = createServiceClient()

  const { data: cluster, error: fetchErr } = await supabase
    .from('clusters')
    .select('status')
    .eq('id', id)
    .single()

  if (fetchErr || !cluster) {
    return NextResponse.json({ error: 'Cluster not found' }, { status: 404 })
  }

  if (cluster.status === 'discarded') {
    return NextResponse.json({ error: 'Already rejected' }, { status: 409 })
  }

  const { error: updateErr } = await supabase
    .from('clusters')
    .update({
      status: 'discarded',
      reviewed_by: 'founder',
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateErr) {
    console.error('[admin/clusters/reject]', updateErr.message)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  await writeAuditLog({
    action: 'cluster_rejected',
    entityType: 'cluster',
    entityId: id,
    oldValue: { status: cluster.status },
    newValue: { status: 'discarded' },
    sessionId: session.sessionId,
    notes: 'Rejected via admin panel',
  })

  return NextResponse.json({ success: true, cluster_id: id, status: 'discarded' })
}
