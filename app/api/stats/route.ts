import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Count exactly what the public map plots so the landing "incidents" number
// agrees with the pin count. Source of truth is app/map/page.tsx:818, which
// fetches clusters in these four statuses (no bounding-box filter). Counting
// only 'confirmed' here was undercounting badly (e.g. 67 vs ~175 on the map).
// 'auto_confirmed' currently yields zero rows (the live DB constraint rejects
// it) but is kept for exact parity with the map's query.
const MAP_STATUSES = ['confirmed', 'auto_confirmed', 'news_verified', 'official_verified'] as const

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
        .in('status', MAP_STATUSES),
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
