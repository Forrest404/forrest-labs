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
  const periods = {
    hour: new Date(now.getTime() - 3600000).toISOString(),
    day: new Date(now.getTime() - 86400000).toISOString(),
    week: new Date(now.getTime() - 604800000).toISOString(),
  }

  const [
    { count: reportsHour },
    { count: reportsDay },
    { count: reportsWeek },
    { count: clustersDay },
    { count: clustersWeek },
    { count: autoConfirmedDay },
    { count: rejectedDay },
    { data: hourlyReports },
  ] = await Promise.all([
    supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', periods.hour),
    supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', periods.day),
    supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', periods.week),
    supabase
      .from('clusters')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', periods.day),
    supabase
      .from('clusters')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', periods.week),
    supabase
      .from('clusters')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'auto_confirmed')
      .gte('created_at', periods.day),
    supabase
      .from('clusters')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'discarded')
      .gte('created_at', periods.day),
    supabase
      .from('reports')
      .select('created_at')
      .gte('created_at', periods.day)
      .order('created_at', { ascending: true }),
  ])

  const hourBuckets: Record<number, number> = {}
  for (let i = 0; i < 24; i++) {
    hourBuckets[i] = 0
  }
  hourlyReports?.forEach((r) => {
    const hour = new Date(r.created_at as string).getUTCHours()
    hourBuckets[hour]++
  })

  const autoConfirmRate = clustersDay
    ? Math.round(((autoConfirmedDay ?? 0) / (clustersDay ?? 1)) * 100)
    : 0

  return NextResponse.json({
    reports: {
      last_hour: reportsHour ?? 0,
      last_24h: reportsDay ?? 0,
      last_7d: reportsWeek ?? 0,
      hourly_breakdown: hourBuckets,
    },
    clusters: {
      last_24h: clustersDay ?? 0,
      last_7d: clustersWeek ?? 0,
      auto_confirmed_today: autoConfirmedDay ?? 0,
      rejected_today: rejectedDay ?? 0,
      auto_confirm_rate: autoConfirmRate,
    },
    generated_at: now.toISOString(),
  })
}
