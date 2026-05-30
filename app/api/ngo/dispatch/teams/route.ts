import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { ACTIVE_DISPATCH, distanceKm, hazardOf, preferredTeamTypes } from '@/lib/ngo-dispatch'

// Teams ranked for assigning to a given incident: type match first, then
// proximity (team last-known location → incident), standby ahead of busy.
export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const clusterId = new URL(request.url).searchParams.get('cluster_id') ?? ''
  if (!clusterId) return NextResponse.json({ error: 'cluster_id required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: cluster } = await supabase
    .from('clusters').select('centroid_lat, centroid_lon, dominant_event_types').eq('id', clusterId).maybeSingle()
  if (!cluster) return NextResponse.json({ error: 'Incident not found' }, { status: 404 })

  const preferred = preferredTeamTypes(hazardOf(cluster))

  const { data: teams } = await supabase
    .from('ngo_teams')
    .select('id, name, type, team_status ( status, last_lat, last_lon )')
    .eq('org_id', session!.orgId)

  // Teams currently on an active dispatch are "busy".
  const { data: active } = await supabase
    .from('ngo_dispatches').select('team_id').eq('org_id', session!.orgId).in('status', ACTIVE_DISPATCH)
  const busy = new Set((active ?? []).map((d) => d.team_id).filter(Boolean))

  const ranked = (teams ?? []).map((t: any) => {
    const s = Array.isArray(t.team_status) ? t.team_status[0] : t.team_status
    const hasLoc = s?.last_lat != null && s?.last_lon != null
    return {
      id: t.id,
      name: t.name,
      type: t.type,
      status: s?.status ?? 'offline',
      type_match: preferred.includes(t.type),
      distance_km: hasLoc ? distanceKm(cluster.centroid_lat, cluster.centroid_lon, s.last_lat, s.last_lon) : null,
      busy: busy.has(t.id),
    }
  }).sort((a, b) => {
    if (a.type_match !== b.type_match) return a.type_match ? -1 : 1      // matching type first
    if (a.busy !== b.busy) return a.busy ? 1 : -1                        // free teams first
    const ad = a.distance_km ?? Infinity, bd = b.distance_km ?? Infinity // then nearest
    return ad - bd
  })

  return NextResponse.json({ teams: ranked })
}
