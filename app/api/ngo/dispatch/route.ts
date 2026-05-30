import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { notifyTeam } from '@/lib/ngo-notify'
import { geocode, hazardOf, mapLink } from '@/lib/ngo-dispatch'

// Create a dispatch (one-tap assign) and list the org's dispatches.

export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  let body: { cluster_id?: string; team_id?: string; note?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const clusterId = String(body.cluster_id ?? '')
  const teamId = String(body.team_id ?? '')
  if (!clusterId || !teamId) return NextResponse.json({ error: 'cluster_id and team_id required' }, { status: 400 })

  const supabase = createServiceClient()

  // Team must belong to the caller's org.
  const { data: team } = await supabase.from('ngo_teams').select('id, name').eq('id', teamId).eq('org_id', session!.orgId).maybeSingle()
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  // Incident must exist (read-only on clusters).
  const { data: cluster } = await supabase
    .from('clusters').select('centroid_lat, centroid_lon, dominant_event_types').eq('id', clusterId).maybeSingle()
  if (!cluster) return NextResponse.json({ error: 'Incident not found' }, { status: 404 })

  const note = body.note ? String(body.note).slice(0, 500) : null
  const { data: dispatch, error } = await supabase
    .from('ngo_dispatches')
    .insert({ org_id: session!.orgId, cluster_id: clusterId, team_id: teamId, assigned_by: session!.userId, status: 'assigned', note })
    .select('id')
    .single()
  if (error || !dispatch) return NextResponse.json({ error: 'Could not create dispatch' }, { status: 500 })

  // Notify the team's field coordinators with where + what + a map link.
  const place = await geocode(cluster.centroid_lat, cluster.centroid_lon)
  const hazard = hazardOf(cluster)?.replace(/_/g, ' ') ?? 'incident'
  await notifyTeam(supabase, teamId, {
    title: '🚑 Dispatch',
    body: `${team.name}: ${hazard} at ${place}. ${mapLink(cluster.centroid_lat, cluster.centroid_lon)}${note ? ` · ${note}` : ''}`,
    priority: 'urgent',
    tags: 'ambulance',
  })

  return NextResponse.json({ success: true, dispatch_id: dispatch.id })
}

export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const supabase = createServiceClient()

  const { data: rows } = await supabase
    .from('ngo_dispatches')
    .select('id, cluster_id, team_id, status, note, assigned_at, en_route_at, on_scene_at, done_at, ngo_teams ( name, type ), on_scene_reports ( people_assisted, services, new_hazards, created_at )')
    .eq('org_id', session!.orgId)
    .order('assigned_at', { ascending: false })

  const dispatches = (rows ?? []).map((d: any) => {
    const team = Array.isArray(d.ngo_teams) ? d.ngo_teams[0] : d.ngo_teams
    const report = Array.isArray(d.on_scene_reports) ? d.on_scene_reports[0] : d.on_scene_reports
    return {
      id: d.id,
      cluster_id: d.cluster_id,
      team_id: d.team_id,
      team_name: team?.name ?? null,
      team_type: team?.type ?? null,
      status: d.status,
      note: d.note,
      assigned_at: d.assigned_at,
      en_route_at: d.en_route_at,
      on_scene_at: d.on_scene_at,
      done_at: d.done_at,
      response_minutes: d.on_scene_at && d.assigned_at
        ? Math.round((new Date(d.on_scene_at).getTime() - new Date(d.assigned_at).getTime()) / 60000)
        : null,
      report: report ?? null,
    }
  })

  return NextResponse.json({ dispatches })
}
