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

  const filter = searchParams.get('filter') ?? 'all'
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') ?? '50') || 50), 100)
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0') || 0)

  let query = supabase
    .from('clusters')
    .select(
      'id, status, confidence_score, report_count, centroid_lat, centroid_lon, location_name, created_at, updated_at, dominant_event_types, ai_reasoning, ai_concerns, display_radius_metres, reviewed_by, reviewed_at',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (filter !== 'all') {
    query = query.eq('status', filter)
  }

  const { data, count } = await query

  return NextResponse.json(
    { clusters: data ?? [], total: count ?? 0 },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
