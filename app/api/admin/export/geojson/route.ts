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

  const days = searchParams.get('days') ?? '30'
  const cutoff =
    days !== 'all'
      ? new Date(Date.now() - parseInt(days) * 86400000).toISOString()
      : null

  let query = supabase
    .from('clusters')
    .select(
      `
      id, status, confidence_score,
      report_count, centroid_lat,
      centroid_lon, display_radius_metres,
      dominant_event_types, ai_reasoning,
      location_name, created_at,
      source_name, source_url
    `,
    )
    .in('status', ['confirmed', 'auto_confirmed', 'news_verified', 'official_verified'])
    .order('created_at', { ascending: false })

  if (cutoff) {
    query = query.gte('created_at', cutoff)
  }

  const { data } = await query

  const geojson = {
    type: 'FeatureCollection',
    metadata: {
      generated_at: new Date().toISOString(),
      source: 'Forrest Labs',
      total_features: data?.length ?? 0,
      period: days + ' days',
      license: 'Attribution required',
    },
    features: (data ?? []).map((c) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [c.centroid_lon, c.centroid_lat],
      },
      properties: {
        id: c.id,
        status: c.status,
        confidence_score: c.confidence_score,
        report_count: c.report_count,
        radius_metres: c.display_radius_metres,
        event_types: c.dominant_event_types,
        ai_reasoning: c.ai_reasoning,
        location_name: c.location_name,
        source: c.source_name ?? 'civilian',
        created_at: c.created_at,
      },
    })),
  }

  const dateStr = new Date().toISOString().split('T')[0]

  return new NextResponse(JSON.stringify(geojson, null, 2), {
    headers: {
      'Content-Type': 'application/geo+json',
      'Content-Disposition': `attachment; filename="forrest-labs-${dateStr}.geojson"`,
      'Cache-Control': 'no-store',
    },
  })
}
