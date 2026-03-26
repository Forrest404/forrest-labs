import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { id: clusterId } = await params
  const supabase = createServiceClient()

  const { data: cluster } = await supabase
    .from('clusters')
    .select('*')
    .eq('id', clusterId)
    .single()

  if (!cluster) {
    return NextResponse.json({ error: 'Cluster not found' }, { status: 404 })
  }

  const { data: reports, error: reportsError } = await supabase
    .from('reports')
    .select(
      'id, created_at, lat, lon, distance_band, event_types, media_url, media_status, session_hash, status, cluster_id',
    )
    .eq('cluster_id', clusterId)
    .order('created_at', { ascending: true })

  if (reportsError) {
    console.error('[admin/incidents/id] Reports query failed:', reportsError.message)
  }

  return NextResponse.json(
    { cluster, reports: reports ?? [] },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
