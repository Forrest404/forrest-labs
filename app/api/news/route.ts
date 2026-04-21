import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get('limit') ?? '30', 10) || 30,
    100,
  )

  const { data, error } = await supabase
    .from('news_articles')
    .select(
      'id, source, title, url, published_at, fetched_at, summary, location_name, location_lat, location_lon, event_type, casualty_count, ai_relevance, linked_cluster_id',
    )
    .neq('status', 'dismissed')
    .gte('ai_relevance', 0.5)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: 'Feed unavailable' }, { status: 500 })
  }

  return NextResponse.json(
    { articles: data ?? [] },
    {
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
        'Access-Control-Allow-Origin': '*',
      },
    },
  )
}
