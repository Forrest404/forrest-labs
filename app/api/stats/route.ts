import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Count exactly what the public map plots so the landing "incidents" number
// agrees with it. app/map (MapClient) plots clusters in these four statuses with
// no bounding-box filter — pending_review renders dimmer but is still shown.
// Counting only 'confirmed' here was undercounting badly (e.g. 67 vs ~175 on the
// map). NOTE: this set includes pending_review, which is not strictly
// "confirmed" — kept in sync with the map deliberately; revisit if the tile is
// meant to mean confirmed-only.
const MAP_STATUSES = ['confirmed', 'news_verified', 'official_verified', 'pending_review'] as const

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
