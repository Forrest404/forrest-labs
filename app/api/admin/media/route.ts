import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const searchParams = request.nextUrl.searchParams

  const status = searchParams.get('status')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  // DB uses 'processing' internally; API exposes 'pending' for clarity
  const dbStatus = status === 'pending' ? 'processing' : status

  let query = supabase
    .from('reports')
    .select(
      `
      id, created_at, lat, lon,
      media_url, media_status,
      distance_band, event_types,
      session_hash, cluster_id,
      clusters (
        id, location_name, status,
        confidence_score
      )
    `,
      { count: 'exact' },
    )
    .not('media_url', 'is', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (dbStatus && dbStatus !== 'all') {
    query = query.eq('media_status', dbStatus)
  }

  const [
    { data, count },
    { count: pendingCount },
    { count: approvedCount },
  ] = await Promise.all([
    query,
    supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .not('media_url', 'is', null)
      .eq('media_status', 'processing'),
    supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .not('media_url', 'is', null)
      .eq('media_status', 'approved'),
  ])

  return NextResponse.json({
    reports: data ?? [],
    total: count ?? 0,
    pending_count: pendingCount ?? 0,
    approved_count: approvedCount ?? 0,
  })
}
