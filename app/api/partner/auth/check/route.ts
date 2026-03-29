import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPartnerSession } from '@/lib/admin/auth'

export async function GET(request: NextRequest) {
  const session = await getPartnerSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const [
    { data: org },
    { data: teams },
    { data: resources },
  ] = await Promise.all([
    supabase
      .from('organisations')
      .select('id, name, type')
      .eq('id', session.organisationId)
      .single(),
    supabase
      .from('teams')
      .select('id, name, team_type, status, location_name, capacity')
      .eq('organisation_id', session.organisationId)
      .eq('active', true)
      .order('name'),
    supabase
      .from('resources')
      .select('id, name, resource_type, quantity_total, quantity_available, unit, low_stock_threshold')
      .eq('organisation_id', session.organisationId)
      .order('name'),
  ])

  // Fetch incidents dispatched to this org's teams
  const teamIds = (teams ?? []).map((t) => t.id as string)

  interface DispatchRow {
    cluster_id: string
    status: string
    clusters: {
      id: string
      status: string
      confidence_score: number
      report_count: number
      location_name: string | null
      centroid_lat: number
      centroid_lon: number
      created_at: string
    } | null
  }

  let dispatchedAlerts: DispatchRow[] = []
  if (teamIds.length > 0) {
    const { data } = await supabase
      .from('dispatches')
      .select('cluster_id, status, clusters (id, status, confidence_score, report_count, location_name, centroid_lat, centroid_lon, created_at)')
      .in('team_id', teamIds)
      .in('status', ['assigned', 'acknowledged', 'en_route', 'on_scene'])
      .order('assigned_at', { ascending: false })
    dispatchedAlerts = (data as DispatchRow[] | null) ?? []
  }

  const seen = new Set<string>()
  const alerts = dispatchedAlerts
    .filter((d) => d.clusters !== null)
    .filter((d) => {
      if (seen.has(d.cluster_id)) return false
      seen.add(d.cluster_id)
      return true
    })
    .map((d) => d.clusters)

  const flatTeams = (teams ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    team_type: t.team_type,
    status: t.status,
    current_location: t.location_name,
    capacity: t.capacity,
  }))

  return NextResponse.json({
    organisation: org
      ? { id: org.id, name: org.name, org_type: org.type }
      : null,
    teams: flatTeams,
    resources: resources ?? [],
    recent_alerts: alerts,
  })
}
