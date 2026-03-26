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

  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') ?? '50') || 50), 100)
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0') || 0)
  const hasMedia = searchParams.get('has_media') === 'true'

  let query = supabase
    .from('reports')
    .select(
      'id, created_at, lat, lon, distance_band, event_types, media_url, media_status, session_hash, cluster_id, status',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (hasMedia) {
    query = query.not('media_url', 'is', null).eq('media_status', 'approved')
  }

  const { data, count } = await query

  return NextResponse.json(
    { reports: data ?? [], total: count ?? 0 },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
