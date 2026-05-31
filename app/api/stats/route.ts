import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Match the public map's filter exactly so "confirmed incidents" on the landing
// equals what the map plots. The map (/api/events) counts the three verified
// statuses within the Lebanon bounding box; counting only 'confirmed' here was
// undercounting (e.g. 67 vs ~175 on the map).
const VERIFIED = ['confirmed', 'news_verified', 'official_verified'] as const
const LB = { minLat: 33.05, maxLat: 34.69, minLon: 35.10, maxLon: 36.62 }

export async function GET() {
  try {
    const supabase = createServiceClient()
    const now = new Date()

    const oneDayAgo = new Date(
      now.getTime() - 86400000
    ).toISOString()
    const sevenDaysAgo = new Date(
      now.getTime() - 604800000
    ).toISOString()

    const [
      { count: reportsToday },
      { count: reportsThisWeek },
      { count: confirmedTotal },
      { count: activeWarnings },
      { count: totalReports }
    ] = await Promise.all([
      supabase.from('reports')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneDayAgo),
      supabase.from('reports')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo),
      supabase.from('clusters')
        .select('*', { count: 'exact', head: true })
        .in('status', VERIFIED)
        .gte('centroid_lat', LB.minLat)
        .lte('centroid_lat', LB.maxLat)
        .gte('centroid_lon', LB.minLon)
        .lte('centroid_lon', LB.maxLon),
      supabase.from('warning_clusters')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active'),
      supabase.from('reports')
        .select('*', { count: 'exact', head: true })
    ])

    return NextResponse.json({
      reports_today: reportsToday ?? 0,
      reports_this_week: reportsThisWeek ?? 0,
      confirmed_incidents: confirmedTotal ?? 0,
      active_warnings: activeWarnings ?? 0,
      total_reports: totalReports ?? 0,
      generated_at: now.toISOString(),
      last_updated: new Date().toISOString(),
      system_version: '1.0.0'
    }, {
      headers: {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      }
    })

  } catch (error) {
    console.error('Stats error:', error)
    return NextResponse.json(
      { error: 'Stats unavailable' },
      { status: 500 }
    )
  }
}
