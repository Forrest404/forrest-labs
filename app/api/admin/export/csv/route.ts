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
      dominant_event_types, location_name,
      created_at, source_name
    `,
    )
    .in('status', ['confirmed', 'auto_confirmed', 'news_verified', 'official_verified'])
    .order('created_at', { ascending: false })

  if (cutoff) {
    query = query.gte('created_at', cutoff)
  }

  const { data } = await query

  const headers = [
    'id',
    'status',
    'confidence_score',
    'report_count',
    'latitude',
    'longitude',
    'radius_metres',
    'location_name',
    'event_types',
    'source',
    'created_at',
  ].join(',')

  const rows = (data ?? []).map((c) =>
    [
      c.id,
      c.status,
      c.confidence_score,
      c.report_count,
      c.centroid_lat,
      c.centroid_lon,
      c.display_radius_metres,
      '"' + (c.location_name ?? '').replace(/"/g, '""') + '"',
      '"' + (c.dominant_event_types ?? []).join(';') + '"',
      '"' + (c.source_name ?? 'civilian') + '"',
      c.created_at,
    ].join(','),
  )

  const csv = [headers, ...rows].join('\n')
  const dateStr = new Date().toISOString().split('T')[0]

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="forrest-labs-${dateStr}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
