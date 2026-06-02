import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { pointInPolygon } from '@/lib/ngo-geo'
import { availabilityByTeam, isTeamOffDuty } from '@/lib/ngo-safety'

// Situation-board data for the caller's organisation. READ-ONLY on clusters —
// the board never writes to the verification pipeline. Everything is scoped to
// session.orgId. Returns incidents (with inside/covered flags), the org's team
// pins, and the operational-area polygon.

// Statuses the public map (app/map/page.tsx) shows — kept identical here.
const INCIDENT_STATUSES = ['confirmed', 'auto_confirmed', 'news_verified', 'official_verified']
// A dispatch counts as "covering" an incident while it is still in progress.
const ACTIVE_DISPATCH = ['assigned', 'en_route', 'on_scene']

export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const orgId = session!.orgId
  const supabase = createServiceClient()

  // Operational area (may be null until an org_admin draws one).
  const { data: org } = await supabase
    .from('ngo_organisations')
    .select('operational_area')
    .eq('id', orgId)
    .single()
  const area = (org?.operational_area as { type?: string; coordinates?: number[][][] } | null) ?? null

  // Incidents — verified clusters, newest first. READ ONLY. Windowed by ?days
  // (default 10; 'all' = no limit; clamped 1–3650). Only incidents are time-filtered.
  const daysParam = new URL(request.url).searchParams.get('days')
  const days = daysParam === 'all' ? null : Math.max(1, Math.min(3650, Number(daysParam) || 10))
  let clusterQuery = supabase
    .from('clusters')
    .select('id, centroid_lat, centroid_lon, report_count, confidence_score, display_radius_metres, status, created_at')
    .in('status', INCIDENT_STATUSES)
  if (days !== null) clusterQuery = clusterQuery.gte('created_at', new Date(Date.now() - days * 86400000).toISOString())
  const { data: clusters } = await clusterQuery.order('created_at', { ascending: false }).limit(500)

  // Active dispatches for this org → which clusters / custom incidents are covered.
  const { data: dispatches } = await supabase
    .from('ngo_dispatches')
    .select('cluster_id, ngo_incident_id')
    .eq('org_id', orgId)
    .in('status', ACTIVE_DISPATCH)
  const covered = new Set((dispatches ?? []).map((d) => d.cluster_id).filter(Boolean))
  const coveredIncidents = new Set((dispatches ?? []).map((d) => d.ngo_incident_id).filter(Boolean))

  // NGO handling overlay for public clusters (dismissed / completed). Read-only on
  // clusters; this org's state lives in ngo_cluster_status. Pre-migration safe.
  const clusterHandling = new Map<string, string>()
  try {
    const { data: handled } = await supabase
      .from('ngo_cluster_status').select('cluster_id, status').eq('org_id', orgId)
    for (const h of handled ?? []) clusterHandling.set(h.cluster_id, h.status)
  } catch { /* migration not applied yet */ }

  const allIncidents = (clusters ?? []).map((c) => ({
    id: c.id,
    lat: c.centroid_lat,
    lon: c.centroid_lon,
    status: c.status,
    confidence_score: c.confidence_score,
    report_count: c.report_count,
    created_at: c.created_at,
    radius_metres: c.display_radius_metres ?? 150,
    inside: area ? pointInPolygon(c.centroid_lon, c.centroid_lat, area) : false,
    covered: covered.has(c.id),
    handling: clusterHandling.get(c.id) ?? 'active',
  }))
  // Active incidents drive the map + feed + coverage gaps; handled (dismissed/
  // completed) ones leave the board into a reopenable list.
  const incidents = allIncidents.filter((c) => c.handling === 'active')
  const handledIncidents = allIncidents.filter((c) => c.handling !== 'active')

  // Team pins — one per team that has a known location.
  const { data: teams } = await supabase
    .from('ngo_teams')
    .select('id, name, type, team_status ( status, last_lat, last_lon, last_seen_at )')
    .eq('org_id', orgId)

  // A team whose every linked member is off duty shows as 'off_duty' on the board.
  const availability = await availabilityByTeam(supabase, (teams ?? []).map((t: any) => t.id))

  const teamPins = (teams ?? [])
    .map((t: any) => {
      const s = Array.isArray(t.team_status) ? t.team_status[0] : t.team_status
      return {
        id: t.id,
        name: t.name,
        type: t.type,
        status: isTeamOffDuty(availability[t.id]) ? 'off_duty' : (s?.status ?? 'offline'),
        lat: s?.last_lat ?? null,
        lon: s?.last_lon ?? null,
        last_seen_at: s?.last_seen_at ?? null,
      }
    })
    .filter((t) => t.lat != null && t.lon != null)

  // Per-worker live pins: each active org user's last-known location — the most
  // recent of their latest located check-in (incl. roll-call shares) and their
  // latest located panic. Reads existing tables; no per-worker location column.
  const { data: orgPeople } = await supabase
    .from('ngo_users').select('id, full_name, role').eq('org_id', orgId).eq('status', 'active')
  const peopleIds = (orgPeople ?? []).map((u) => u.id)
  let workers: any[] = []
  if (peopleIds.length) {
    // Only read the last 24h of located events. The board shows each worker's LATEST
    // position (a stale day-old pin isn't operationally useful), and bounding the read
    // means the server never materialises a long location trail in memory — even before
    // the retention purge runs. Latest-per-user reduction below is unchanged.
    const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const [{ data: cis }, { data: pes }] = await Promise.all([
      supabase.from('check_ins').select('ngo_user_id, lat, lon, created_at').in('ngo_user_id', peopleIds).not('lat', 'is', null).gte('created_at', sinceIso).order('created_at', { ascending: false }).limit(1000),
      supabase.from('panic_events').select('ngo_user_id, last_lat, last_lon, created_at').in('ngo_user_id', peopleIds).not('last_lat', 'is', null).gte('created_at', sinceIso).order('created_at', { ascending: false }).limit(500),
    ])
    // Latest located event per user, across both sources.
    const latest = new Map<string, { lat: number; lon: number; at: string; source: string }>()
    for (const c of cis ?? []) {
      const cur = latest.get(c.ngo_user_id)
      if (!cur || new Date(c.created_at) > new Date(cur.at)) latest.set(c.ngo_user_id, { lat: c.lat, lon: c.lon, at: c.created_at, source: 'check_in' })
    }
    for (const p of pes ?? []) {
      const cur = latest.get(p.ngo_user_id)
      if (!cur || new Date(p.created_at) > new Date(cur.at)) latest.set(p.ngo_user_id, { lat: p.last_lat, lon: p.last_lon, at: p.created_at, source: 'panic' })
    }
    const nameOf = new Map((orgPeople ?? []).map((u: any) => [u.id, { name: u.full_name, role: u.role }]))
    workers = [...latest.entries()].map(([uid, v]) => ({
      ngo_user_id: uid, name: nameOf.get(uid)?.name ?? 'Worker', role: nameOf.get(uid)?.role ?? null,
      lat: v.lat, lon: v.lon, last_seen_at: v.at, source: v.source,
    }))
  }

  // Active panics (unresolved, un-cancelled) — surfaced prominently. Scope by the
  // org's users (also gives us names + phones for Call). Rich responder fields where
  // present; resilient to the panic-revamp columns being absent.
  const { data: orgUsers } = await supabase.from('ngo_users').select('id, full_name, phone').eq('org_id', orgId)
  const userName = new Map((orgUsers ?? []).map((u: any) => [u.id, u.full_name]))
  const userPhone = new Map((orgUsers ?? []).map((u: any) => [u.id, u.phone]))
  const orgUserIds = (orgUsers ?? []).map((u: any) => u.id)
  let panics: any[] = []
  if (orgUserIds.length) {
    const rich = 'id, last_lat, last_lon, created_at, ngo_user_id, silent, reason, acknowledged_at, acknowledged_by'
    let pres: any = await supabase.from('panic_events').select(rich)
      .is('resolved_at', null).is('cancelled_at', null).in('ngo_user_id', orgUserIds).order('created_at', { ascending: false })
    if (pres.error) {
      pres = await supabase.from('panic_events').select('id, last_lat, last_lon, created_at, ngo_user_id')
        .is('resolved_at', null).in('ngo_user_id', orgUserIds).order('created_at', { ascending: false })
    }
    panics = (pres.data ?? []).map((p: any) => ({
      id: p.id,
      ngo_user_id: p.ngo_user_id,
      name: userName.get(p.ngo_user_id) ?? 'Field coordinator',
      phone: userPhone.get(p.ngo_user_id) ?? null,
      lat: p.last_lat,
      lon: p.last_lon,
      created_at: p.created_at,
      silent: p.silent ?? false,
      reason: p.reason ?? null,
      acknowledged_at: p.acknowledged_at ?? null,
      acknowledged_by_name: p.acknowledged_by ? (userName.get(p.acknowledged_by) ?? 'A responder') : null,
    }))
  }

  // Live roll call — newest org roll call in the last 60 min + responses + roster.
  const since = new Date(Date.now() - 60 * 60000).toISOString()
  const { data: rc } = await supabase
    .from('roll_calls')
    .select('id, message, created_at')
    .eq('org_id', orgId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let rollCall: any = null
  if (rc) {
    const { data: roster } = await supabase
      .from('ngo_users')
      .select('id, full_name, off_duty')
      .eq('org_id', orgId)
      .eq('role', 'field_coordinator')
      .eq('status', 'active')
    const { data: responses } = await supabase
      .from('roll_call_responses')
      .select('ngo_user_id, safe')
      .eq('roll_call_id', rc.id)
    // Map each responder to their answer. A row means they answered; safe=false = explicitly
    // unsafe, anything else (true/null) = safe. Absence of a row = awaiting.
    const answer = new Map((responses ?? []).map((r) => [r.ngo_user_id, r.safe !== false]))
    // Per-member state. OFF DUTY is exempt — an off-duty worker who hasn't tapped must NEVER
    // read as missing (false missing-person signal). awaiting (on-duty, no answer) is distinct
    // from unsafe (answered safe=false).
    const members = (roster ?? []).map((u) => {
      const state = (u as any).off_duty
        ? 'off_duty'
        : answer.has(u.id)
          ? (answer.get(u.id) ? 'safe' : 'unsafe')
          : 'awaiting'
      return { id: u.id, name: u.full_name, state, safe: state === 'safe' }
    })
    const accountable = members.filter((m) => m.state !== 'off_duty')
    rollCall = {
      id: rc.id,
      created_at: rc.created_at,
      message: rc.message,
      total: accountable.length, // Y in "X of Y safe" — excludes off-duty (exempt)
      safe_count: accountable.filter((m) => m.state === 'safe').length,
      unsafe_count: accountable.filter((m) => m.state === 'unsafe').length,
      awaiting_count: accountable.filter((m) => m.state === 'awaiting').length,
      off_duty_count: members.length - accountable.length,
      members,
    }
  }

  // Dispatches (active + recent) keyed to incidents, with response time, for the
  // feed cards and quick reassign/recall.
  const { data: dispRows } = await supabase
    .from('ngo_dispatches')
    .select('id, cluster_id, ngo_incident_id, team_id, status, assigned_at, on_scene_at, ngo_teams ( name )')
    .eq('org_id', orgId)
    .order('assigned_at', { ascending: false })
  const dispatchSummaries = (dispRows ?? []).map((d: any) => {
    const team = Array.isArray(d.ngo_teams) ? d.ngo_teams[0] : d.ngo_teams
    return {
      id: d.id,
      cluster_id: d.cluster_id,
      ngo_incident_id: d.ngo_incident_id,
      team_id: d.team_id,
      team_name: team?.name ?? null,
      status: d.status,
      response_minutes: d.on_scene_at && d.assigned_at
        ? Math.round((new Date(d.on_scene_at).getTime() - new Date(d.assigned_at).getTime()) / 60000)
        : null,
    }
  })

  // Custom (org-created) incidents. Open ones are active (with a covered flag);
  // resolved/dismissed ones go to a reopenable handled list (recent 50).
  // Resilient to the migration not being applied yet (table/column may be absent).
  let customIncidents: any[] = []
  let handledCustomIncidents: any[] = []
  try {
    const { data: ci } = await supabase
      .from('ngo_incidents')
      .select('id, title, category, severity, description, address, lat, lon, created_at, status')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(250)
    const rows = ci ?? []
    customIncidents = rows.filter((i: any) => i.status === 'open')
      .map((i: any) => ({ ...i, covered: coveredIncidents.has(i.id) }))
    handledCustomIncidents = rows.filter((i: any) => i.status !== 'open').slice(0, 50)
  } catch { /* migration not applied yet */ }

  return NextResponse.json({
    operational_area: area,
    incidents,
    handled_incidents: handledIncidents,
    custom_incidents: customIncidents,
    handled_custom_incidents: handledCustomIncidents,
    teams: teamPins,
    workers,
    panics,
    roll_call: rollCall,
    dispatches: dispatchSummaries,
    generated_at: new Date().toISOString(),
  })
}
