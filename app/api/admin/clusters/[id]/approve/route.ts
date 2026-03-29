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
    .select('status, centroid_lat, centroid_lon, display_radius_metres, location_name, confidence_score, report_count')
    .eq('id', id)
    .single()

  if (fetchErr || !cluster) {
    return NextResponse.json({ error: 'Cluster not found' }, { status: 404 })
  }

  if (cluster.status === 'confirmed') {
    return NextResponse.json({ error: 'Already confirmed' }, { status: 409 })
  }

  const { error: updateErr } = await supabase
    .from('clusters')
    .update({
      status: 'confirmed',
      reviewed_by: 'founder',
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateErr) {
    console.error('[admin/clusters/approve]', updateErr.message)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  await supabase
    .from('alerts')
    .upsert(
      {
        cluster_id: id,
        confirmed_by: 'founder',
        radius_metres: cluster.display_radius_metres as number,
        location_name: cluster.location_name as string,
      },
      { onConflict: 'cluster_id', ignoreDuplicates: true },
    )

  await writeAuditLog({
    action: 'cluster_confirmed',
    entityType: 'cluster',
    entityId: id,
    oldValue: { status: cluster.status },
    newValue: { status: 'confirmed' },
    sessionId: session.sessionId,
    notes: 'Confirmed via admin panel',
  })

  return NextResponse.json({ success: true, cluster_id: id, status: 'confirmed' })
}
