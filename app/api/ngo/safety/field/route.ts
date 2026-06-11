import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { resolveTeamId } from '@/lib/ngo-safety'

// State for the mobile field view: the coordinator's team + status, their last
// check-in, and any active roll call they have not yet answered.
export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['field_coordinator'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const userId = session!.userId

  // Check-in cadence + the org's "ack visible to field" default. select('*') so missing
  // columns (migrations not applied) don't error. Defaults: 240 min, ack visible.
  let checkinWindow = 240
  let ackVisibleDefault = true
  // Org base location (worldwide onboarding) — the field map's fallback centre when
  // the worker has no GPS fix yet. Null pre-migration / when unset.
  let orgBase: { lat: number; lon: number; zoom: number | null } | null = null
  try {
    const { data: org } = await supabase
      .from('ngo_organisations').select('*').eq('id', session!.orgId).maybeSingle()
    if (org && (org as any).checkin_window_minutes != null) checkinWindow = (org as any).checkin_window_minutes
    if (org && (org as any).panic_ack_visible_default != null) ackVisibleDefault = (org as any).panic_ack_visible_default
    if (org && (org as any).base_lat != null && (org as any).base_lon != null) {
      orgBase = { lat: (org as any).base_lat, lon: (org as any).base_lon, zoom: (org as any).base_zoom ?? null }
    }
  } catch { /* columns may be absent */ }

  const teamId = await resolveTeamId(supabase, userId)

  let team: any = null
  if (teamId) {
    // group_chat_url is additive — fall back to the base select pre-migration.
    const sel = 'id, name, type, team_status ( status, last_seen_at )'
    let res: any = await supabase.from('ngo_teams').select(`${sel}, group_chat_url`).eq('id', teamId).maybeSingle()
    if (res.error && (res.error.code === 'PGRST204' || res.error.code === '42703')) {
      res = await supabase.from('ngo_teams').select(sel).eq('id', teamId).maybeSingle()
    }
    const data: any = res.data
    if (data) {
      const s = Array.isArray(data.team_status) ? data.team_status[0] : data.team_status
      team = { id: data.id, name: data.name, type: data.type, status: s?.status ?? 'offline', last_seen_at: s?.last_seen_at ?? null, group_chat_url: data.group_chat_url ?? null }
      // The team's leader, for the field worker's read-only "my team" view: a member of this
      // team whose linked account is an active team_leader / org_admin (first by appearance).
      const { data: lm } = await supabase
        .from('team_members').select('ngo_users!inner ( full_name, role, status )')
        .eq('team_id', teamId).not('ngo_user_id', 'is', null)
      const lead = (lm ?? [])
        .map((m: any) => (Array.isArray(m.ngo_users) ? m.ngo_users[0] : m.ngo_users))
        .find((u: any) => u && u.status === 'active' && (u.role === 'team_leader' || u.role === 'org_admin'))
      team.leader_name = lead?.full_name ?? null
    }
  }

  const { data: lastCheckIn } = await supabase
    .from('check_ins')
    .select('created_at')
    .eq('ngo_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Active roll call = newest org roll_call in the last 60 min not yet answered by me.
  const since = new Date(Date.now() - 60 * 60000).toISOString()
  const { data: rc } = await supabase
    .from('roll_calls')
    .select('id, message, created_at')
    .eq('org_id', session!.orgId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let activeRollCall: any = null
  if (rc) {
    const { data: resp } = await supabase
      .from('roll_call_responses')
      .select('id')
      .eq('roll_call_id', rc.id)
      .eq('ngo_user_id', userId)
      .maybeSingle()
    activeRollCall = { id: rc.id, message: rc.message, created_at: rc.created_at, answered: !!resp }
  }

  // The worker's own active panic (drives the post-fire panel: reason chips, the cancel
  // window, and the "help has seen this" feedback). Resilient to pre-revamp columns.
  let activePanic: any = null
  let pres: any = await supabase
    .from('panic_events').select('id, created_at, silent, reason, acknowledged_at')
    .eq('ngo_user_id', userId).is('resolved_at', null).is('cancelled_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (pres.error) {
    pres = await supabase.from('panic_events').select('id, created_at')
      .eq('ngo_user_id', userId).is('resolved_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
  }
  if (pres.data) {
    const p = pres.data
    activePanic = {
      id: p.id, created_at: p.created_at,
      silent: p.silent ?? false, reason: p.reason ?? null,
      // Only surface acknowledgement to the device when NOT silent and the org allows it.
      acknowledged: !!p.acknowledged_at && !(p.silent ?? false) && ackVisibleDefault,
    }
  }

  return NextResponse.json({
    team,
    last_check_in: lastCheckIn?.created_at ?? null,
    active_roll_call: activeRollCall,
    checkin_window_minutes: checkinWindow,
    active_panic: activePanic,
    org_base: orgBase,
  })
}
