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
    .select('id, name, status, team_type, current_lat, current_lon, location_name, capacity, notes, updated_at, organisation_id, organisations (id, name, type)')
    .eq('active', true)
    .order('status')
    .order('name')

  if (orgFilter) teamsQuery = teamsQuery.eq('organisation_id', orgFilter)

  const dispatchQuery = supabase
    .from('dispatches')
    .select('id, status, assigned_at, acknowledged_at, arrived_at, completed_at, cancelled_at, notes, team_id, cluster_id, teams (id, name, team_type, organisations (name)), clusters (id, location_name, centroid_lat, centroid_lon, confidence_score, status)')
    .in('status', ['assigned', 'acknowledged', 'en_route', 'on_scene'])
    .order('assigned_at', { ascending: false })
    .limit(20)

  const recentDispatchQuery = supabase
    .from('dispatches')
    .select('id, status, assigned_at, acknowledged_at, arrived_at, completed_at, cancelled_at, notes, team_id, cluster_id, teams (id, name, team_type, organisations (name)), clusters (id, location_name, centroid_lat, centroid_lon, confidence_score, status)')
    .order('assigned_at', { ascending: false })
    .limit(20)

  let resourceQuery = supabase
    .from('resources')
    .select('id, resource_type, name, quantity_total, quantity_available, unit, low_stock_threshold, organisation_id, organisations (name)')
    .order('resource_type')

  if (orgFilter) resourceQuery = resourceQuery.eq('organisation_id', orgFilter)

  const alertsQuery = supabase
    .from('clusters')
    .select('id, status, confidence_score, report_count, location_name, centroid_lat, centroid_lon, created_at, dominant_event_types')
    .in('status', ['confirmed', 'auto_confirmed', 'news_verified', 'official_verified'])
    .order('created_at', { ascending: false })
    .limit(20)

  const [{ data: teams }, { data: activeDispatches }, { data: recentDispatches }, { data: resources }, { data: alerts }] = await Promise.all([
    teamsQuery,
    dispatchQuery,
    recentDispatchQuery,
    resourceQuery,
    alertsQuery,
  ])

  // Flatten teams: nested organisations → flat organisation_name, location_name → current_location
  interface TeamRow {
    id: string
    name: string
    status: string
    team_type: string
    location_name: string | null
    capacity: number
    organisation_id: string
    organisations: { id: string; name: string } | null
  }
  const flatTeams = ((teams as TeamRow[] | null) ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    team_type: t.team_type,
    current_location: t.location_name,
    capacity: t.capacity,
    organisation_id: t.organisation_id,
    organisation_name: t.organisations?.name ?? 'Unknown',
  }))

  // Flatten dispatches
  interface DispatchRow {
    id: string
    status: string
    assigned_at: string
    acknowledged_at: string | null
    arrived_at: string | null
    completed_at: string | null
    team_id: string
    cluster_id: string
    teams: { id: string; name: string; team_type: string; organisations: { name: string } | null } | null
    clusters: { id: string; location_name: string | null; confidence_score: number; status: string } | null
  }
  const flattenDispatch = (d: DispatchRow) => ({
    id: d.id,
    team_id: d.team_id,
    team_name: d.teams?.name ?? 'Unknown',
    organisation_name: d.teams?.organisations?.name ?? 'Unknown',
    team_type: d.teams?.team_type ?? 'unknown',
    cluster_id: d.cluster_id,
    location_name: d.clusters?.location_name ?? null,
    confidence_score: d.clusters?.confidence_score ?? 0,
    status: d.status,
    assigned_at: d.assigned_at,
    acknowledged_at: d.acknowledged_at,
    arrived_at: d.arrived_at,
    completed_at: d.completed_at,
  })

  const flatActiveDispatches = ((activeDispatches as DispatchRow[] | null) ?? []).map(flattenDispatch)
  const flatRecentDispatches = ((recentDispatches as DispatchRow[] | null) ?? []).map(flattenDispatch)

  // Flatten resources
  interface ResourceRow {
    id: string
    resource_type: string
    name: string
    quantity_total: number
    quantity_available: number
    unit: string
    low_stock_threshold: number
    organisation_id: string
    organisations: { name: string } | null
  }
  const flatResources = ((resources as ResourceRow[] | null) ?? []).map((r) => ({
    id: r.id,
    resource_type: r.resource_type,
    name: r.name,
    quantity_total: r.quantity_total,
    quantity_available: r.quantity_available,
    unit: r.unit,
    low_stock_threshold: r.low_stock_threshold,
    organisation_id: r.organisation_id,
    organisation_name: r.organisations?.name ?? 'Unknown',
  }))

  const teamStats = {
    standby: flatTeams.filter((t) => t.status === 'standby').length,
    deployed: flatTeams.filter((t) => t.status === 'deployed').length,
    unavailable: flatTeams.filter((t) => t.status === 'unavailable').length,
    total: flatTeams.length,
  }

  const lowStock = flatResources.filter((r) => r.quantity_available <= r.low_stock_threshold)

  return NextResponse.json(
    {
      teams: flatTeams,
      team_stats: teamStats,
      active_dispatches: flatActiveDispatches,
      recent_dispatches: flatRecentDispatches,
      resources: flatResources,
      low_stock_alerts: lowStock,
      recent_alerts: alerts ?? [],
      generated_at: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
