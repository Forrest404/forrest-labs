import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 86400000).toISOString()

  const [
    { count: totalReports },
    { count: reportsToday },
    { count: confirmed },
    { count: autoConfirmed },
    { count: pendingReview },
    { count: discarded },
    { count: activeWarnings },
    { count: allClearWarnings },
    { data: recentClusters },
  ] = await Promise.all([
    supabase.from('reports').select('*', { count: 'exact', head: true }),
    supabase.from('reports').select('*', { count: 'exact', head: true }).gte('created_at', oneDayAgo),
    supabase.from('clusters').select('*', { count: 'exact', head: true }).eq('status', 'confirmed'),
    supabase.from('clusters').select('*', { count: 'exact', head: true }).eq('status', 'auto_confirmed'),
    supabase.from('clusters').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('clusters').select('*', { count: 'exact', head: true }).eq('status', 'discarded'),
    supabase.from('warning_clusters').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('warning_clusters').select('*', { count: 'exact', head: true }).eq('status', 'all_clear'),
    supabase
      .from('clusters')
      .select(
        'id, status, confidence_score, report_count, centroid_lat, centroid_lon, location_name, created_at, dominant_event_types, ai_reasoning',
      )
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return NextResponse.json(
    {
      reports: {
        total: totalReports ?? 0,
        today: reportsToday ?? 0,
      },
      clusters: {
        confirmed: confirmed ?? 0,
        auto_confirmed: autoConfirmed ?? 0,
        pending_review: pendingReview ?? 0,
        discarded: discarded ?? 0,
      },
      warnings: {
        active: activeWarnings ?? 0,
        all_clear: allClearWarnings ?? 0,
      },
      recent_clusters: recentClusters ?? [],
      generated_at: now.toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
