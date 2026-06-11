import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { notifyTeam } from '@/lib/ngo-notify'
// Create a dispatch (one-tap assign) and list the org's dispatches.

export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  let body: { cluster_id?: string; ngo_incident_id?: string; team_id?: string; note?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const clusterId = body.cluster_id ? String(body.cluster_id) : ''
  const incidentId = body.ngo_incident_id ? String(body.ngo_incident_id) : ''
  const teamId = String(body.team_id ?? '')
  if (!teamId) return NextResponse.json({ error: 'team_id required' }, { status: 400 })
  if (!clusterId && !incidentId) return NextResponse.json({ error: 'cluster_id or ngo_incident_id required' }, { status: 400 })

  const supabase = createServiceClient()

  // Team must belong to the caller's org.
  const { data: team } = await supabase.from('ngo_teams').select('id, name').eq('id', teamId).eq('org_id', session!.orgId).maybeSingle()
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  // Validate the target exists and (for a custom incident) belongs to the caller's org.
  // Only existence/authorisation is needed here — coordinates are NOT relayed (security C1).
  if (incidentId) {
    const { data: inc } = await supabase
      .from('ngo_incidents').select('id').eq('id', incidentId).eq('org_id', session!.orgId).maybeSingle()
    if (!inc) return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
  } else {
    const { data: cluster } = await supabase
      .from('clusters').select('id').eq('id', clusterId).maybeSingle()
    if (!cluster) return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
  }

  const note = body.note ? String(body.note).slice(0, 500) : null
  const { data: dispatch, error } = await supabase
    .from('ngo_dispatches')
    .insert({ org_id: session!.orgId, cluster_id: clusterId || null, ngo_incident_id: incidentId || null, team_id: teamId, assigned_by: session!.userId, status: 'assigned', note })
    .select('id')
    .single()
  if (error || !dispatch) {
    // Idempotency (H2): a partial unique index rejects a second ACTIVE dispatch of the same
    // team to the same target. Return the existing one rather than a duplicate + a duplicate
    // team alert — covers two leaders dispatching at once / a double-tap.
    if ((error as { code?: string } | null)?.code === '23505') {
      let q = supabase.from('ngo_dispatches').select('id')
        .eq('org_id', session!.orgId).eq('team_id', teamId).in('status', ['assigned', 'en_route', 'on_scene'])
      q = incidentId ? q.eq('ngo_incident_id', incidentId) : q.eq('cluster_id', clusterId)
      const { data: existing } = await q.limit(1).maybeSingle()
      if (existing) return NextResponse.json({ success: true, dispatch_id: existing.id, duplicate: true })
    }
    return NextResponse.json({ error: 'Could not create dispatch' }, { status: 500 })
  }

  // Sanitised broadcast (security C1): no coordinates/place/map link on the relay; the
  // assigned team opens NOUR (authenticated) to see the incident location.
  await notifyTeam(supabase, teamId, {
    event: 'dispatch',
    title: '🚑 Dispatch',
    body: `${team.name}: new dispatch assigned. Open NOUR for the location.`,
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
    .select('id, cluster_id, ngo_incident_id, team_id, status, note, assigned_at, en_route_at, on_scene_at, done_at, ngo_teams ( name, type ), ngo_incidents ( title, severity ), on_scene_reports ( people_assisted, services, new_hazards, created_at )')
    .eq('org_id', session!.orgId)
    .order('assigned_at', { ascending: false })
    .limit(300)

  const dispatches = (rows ?? []).map((d: any) => {
    const team = Array.isArray(d.ngo_teams) ? d.ngo_teams[0] : d.ngo_teams
    const inc = Array.isArray(d.ngo_incidents) ? d.ngo_incidents[0] : d.ngo_incidents
    const report = Array.isArray(d.on_scene_reports) ? d.on_scene_reports[0] : d.on_scene_reports
    return {
      id: d.id,
      cluster_id: d.cluster_id,
      ngo_incident_id: d.ngo_incident_id,
      incident_label: inc ? `${inc.severity} · ${inc.title}` : null,
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

// Clear dispatch history: delete this org's CLOSED dispatches (done / cancelled).
// Active dispatches (assigned/en_route/on_scene) are never touched. on_scene_reports
// cascade. Optional ?all=1 (org_admin only) clears active ones too. Org-scoped.
export async function DELETE(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const all = new URL(request.url).searchParams.get('all') === '1'
  if (all && session!.role !== 'org_admin') {
    return NextResponse.json({ error: 'Only an org admin can clear active dispatches' }, { status: 403 })
  }
  const supabase = createServiceClient()
  let q = supabase.from('ngo_dispatches').delete().eq('org_id', session!.orgId)
  if (!all) q = q.in('status', ['done', 'cancelled'])
  const { data, error } = await q.select('id')
  if (error) return NextResponse.json({ error: 'Could not clear history' }, { status: 500 })
  return NextResponse.json({ success: true, deleted: data?.length ?? 0 })
}
