import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest, getPartnerSession } from '@/lib/admin/auth'

export async function GET(request: NextRequest) {
  const adminSession = await getSessionFromRequest(request)
  const partnerSession = await getPartnerSession(request)

  if (!adminSession && !partnerSession) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const orgFilter = partnerSession ? partnerSession.organisationId : null
  const supabase = createServiceClient()

  let teamsQuery = supabase
    .from('teams')
    .select('id, name, status, team_type, current_lat, current_lon, location_name, capacity, notes, updated_at, organisations (id, name, type)')
    .order('status')
    .order('name')

  if (orgFilter) teamsQuery = teamsQuery.eq('organisation_id', orgFilter)

  let dispatchQuery = supabase
    .from('dispatches')
    .select('id, status, assigned_at, acknowledged_at, arrived_at, completed_at, notes, teams (id, name, team_type, organisations (name)), clusters (id, location_name, centroid_lat, centroid_lon, confidence_score, status)')
    .in('status', ['assigned', 'acknowledged', 'en_route', 'on_scene'])
    .order('assigned_at', { ascending: false })
    .limit(20)

  let resourceQuery = supabase
    .from('resources')
    .select('id, resource_type, name, quantity_total, quantity_available, unit, low_stock_threshold, organisations (name)')
    .order('resource_type')

  if (orgFilter) resourceQuery = resourceQuery.eq('organisation_id', orgFilter)

  const alertsQuery = supabase
    .from('alerts')
    .select('id, created_at, location_name, radius_metres, clusters (id, centroid_lat, centroid_lon, confidence_score, report_count, dominant_event_types, status)')
    .order('created_at', { ascending: false })
    .limit(10)

  const [{ data: teams }, { data: activeDispatches }, { data: resources }, { data: alerts }] = await Promise.all([
    teamsQuery,
    dispatchQuery,
    resourceQuery,
    alertsQuery,
  ])

  interface TeamRow { status: string }
  interface ResourceRow { quantity_available: number; low_stock_threshold: number }

  const teamStats = {
    standby: (teams as TeamRow[] | null)?.filter((t) => t.status === 'standby').length ?? 0,
    deployed: (teams as TeamRow[] | null)?.filter((t) => t.status === 'deployed').length ?? 0,
    unavailable: (teams as TeamRow[] | null)?.filter((t) => t.status === 'unavailable').length ?? 0,
    total: teams?.length ?? 0,
  }

  const lowStock = ((resources as ResourceRow[] | null) ?? []).filter(
    (r) => r.quantity_available <= r.low_stock_threshold,
  )

  return NextResponse.json(
    {
      teams: teams ?? [],
      team_stats: teamStats,
      active_dispatches: activeDispatches ?? [],
      resources: resources ?? [],
      low_stock_alerts: lowStock,
      recent_alerts: (alerts ?? []).map((a: Record<string, unknown>) => a.clusters).filter(Boolean),
      generated_at: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
