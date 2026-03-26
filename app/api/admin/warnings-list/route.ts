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
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)

  let query = supabase
    .from('warning_clusters')
    .select(
      'id, created_at, status, centroid_lat, centroid_lon, warning_count, dominant_warning_type, confidence_score, location_name, expires_at, all_clear_votes, converted_to_strike, all_clear_at',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (filter !== 'all') {
    query = query.eq('status', filter)
  }

  const { data, count } = await query

  return NextResponse.json(
    { warnings: data ?? [], total: count ?? 0 },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
