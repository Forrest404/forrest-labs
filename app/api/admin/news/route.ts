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

  const limit = Math.min(parseInt(searchParams.get('limit') ?? '30'), 100)
  const status = searchParams.get('status')
  const linkedOnly = searchParams.get('linked_only') === 'true'

  let query = supabase
    .from('news_articles')
    .select(
      'id, created_at, fetched_at, source, title, url, published_at, summary, location_name, location_lat, location_lon, event_type, casualty_count, ai_relevance, status, linked_cluster_id, match_confidence',
    )
    .order('fetched_at', { ascending: false })
    .limit(limit)

  if (status) {
    query = query.eq('status', status)
  }

  if (linkedOnly) {
    query = query.not('linked_cluster_id', 'is', null)
  }

  const { data } = await query

  return NextResponse.json(
    { articles: data ?? [] },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
