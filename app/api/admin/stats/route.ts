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

  let totalReports = 0, reportsToday = 0, confirmed = 0, autoConfirmed = 0
  let pendingReview = 0, discarded = 0, activeWarnings = 0, allClearWarnings = 0
  let recentClusters: Record<string, unknown>[] = []

  try {
    const [r1, r2, r3, r4, r5, r6, r7, r8, r9] = await Promise.all([
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
        .select('id, status, confidence_score, report_count, centroid_lat, centroid_lon, location_name, created_at, dominant_event_types, ai_reasoning')
        .order('created_at', { ascending: false })
        .limit(20),
    ])
    totalReports = r1.count ?? 0
    reportsToday = r2.count ?? 0
    confirmed = r3.count ?? 0
    autoConfirmed = r4.count ?? 0
    pendingReview = r5.count ?? 0
    discarded = r6.count ?? 0
    activeWarnings = r7.count ?? 0
    allClearWarnings = r8.count ?? 0
    recentClusters = (r9.data ?? []) as Record<string, unknown>[]
  } catch (err) {
    console.error('[admin/stats] Database queries failed:', err)
  }

  return NextResponse.json(
    {
      reports: { total: totalReports, today: reportsToday },
      clusters: { confirmed, auto_confirmed: autoConfirmed, pending_review: pendingReview, discarded },
      warnings: { active: activeWarnings, all_clear: allClearWarnings },
      recent_clusters: recentClusters,
      generated_at: now.toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
