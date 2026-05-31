import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { resolveTeamId } from '@/lib/ngo-safety'
import { notifyOrgRoles } from '@/lib/ngo-notify'

// Active (unresolved, un-cancelled) panics for the org — the responder feed used by
// the dedicated panic view. Leaders/admins only. Org-scoped via panic_events.org_id
// (with a fallback to the panicking user's org for any pre-backfill rows).
export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const orgId = session!.orgId

  const cols = 'id, ngo_user_id, team_id, last_lat, last_lon, created_at, silent, reason, acknowledged_at, acknowledged_by'
  let res: any = await supabase
    .from('panic_events').select(cols).eq('org_id', orgId)
    .is('resolved_at', null).is('cancelled_at', null)
    .order('created_at', { ascending: false })
  // Pre-revamp fallback: no org_id / extra columns — scope via the org's users.
  if (res.error) {
    const { data: ou } = await supabase.from('ngo_users').select('id').eq('org_id', orgId)
    const ids = (ou ?? []).map((u: any) => u.id)
    res = ids.length
      ? await supabase.from('panic_events').select('id, ngo_user_id, team_id, last_lat, last_lon, created_at').in('ngo_user_id', ids).is('resolved_at', null).order('created_at', { ascending: false })
      : { data: [] }
  }
  const rows = res.data ?? []

  // Names + phones (worker and acknowledger), and each team's group-chat link.
  const { data: users } = await supabase.from('ngo_users').select('id, full_name, phone').eq('org_id', orgId)
  const byId = new Map((users ?? []).map((u: any) => [u.id, u]))
  const teamIds = [...new Set(rows.map((r: any) => r.team_id).filter(Boolean))]
  const teamChat = new Map<string, string | null>()
  if (teamIds.length) {
    let tres: any = await supabase.from('ngo_teams').select('id, group_chat_url').in('id', teamIds)
    if (tres.error) tres = await supabase.from('ngo_teams').select('id').in('id', teamIds)
    for (const t of tres.data ?? []) teamChat.set(t.id, (t as any).group_chat_url ?? null)
  }

  const panics = rows.map((r: any) => ({
    id: r.id,
    ngo_user_id: r.ngo_user_id,
    name: byId.get(r.ngo_user_id)?.full_name ?? 'Field coordinator',
    phone: byId.get(r.ngo_user_id)?.phone ?? null,
    team_id: r.team_id ?? null,
    group_chat_url: r.team_id ? (teamChat.get(r.team_id) ?? null) : null,
    lat: r.last_lat ?? null,
    lon: r.last_lon ?? null,
    created_at: r.created_at,
    silent: r.silent ?? false,
    reason: r.reason ?? null,
    acknowledged_at: r.acknowledged_at ?? null,
    acknowledged_by_name: r.acknowledged_by ? (byId.get(r.acknowledged_by)?.full_name ?? 'A responder') : null,
  }))
  return NextResponse.json({ panics })
}

// One-tap duress alert. Records a panic_events row and fires push + SMS to every
// team_leader and org_admin in the org. The unresolved panic_event is the flag the
// board reads to surface the coordinator (and that any future cross-org shared view
// must use to hide them — data minimisation).
export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['field_coordinator'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  let body: { lat?: number; lon?: number } = {}
  try { body = await request.json() } catch { /* panic must fire even with no body */ }
  const lat = typeof body.lat === 'number' ? body.lat : null
  const lon = typeof body.lon === 'number' ? body.lon : null

  const supabase = createServiceClient()
  const teamId = await resolveTeamId(supabase, session!.userId)

  // Scope the row to the org. Resilient to the revamp migration not being applied yet:
  // if the org_id column is missing, retry the legacy shape so a panic NEVER fails to fire.
  const base = { ngo_user_id: session!.userId, team_id: teamId, last_lat: lat, last_lon: lon }
  let { data: panic, error } = await supabase
    .from('panic_events').insert({ ...base, org_id: session!.orgId }).select('id').single()
  if (error && (error.code === 'PGRST204' || error.code === '42703')) {
    ({ data: panic, error } = await supabase.from('panic_events').insert(base).select('id').single())
  }
  if (error || !panic) return NextResponse.json({ error: 'Could not raise alert' }, { status: 500 })

  // Who is panicking — for the alert text.
  const { data: me } = await supabase.from('ngo_users').select('full_name').eq('id', session!.userId).maybeSingle()
  const who = me?.full_name ?? 'A field coordinator'
  const loc = lat != null && lon != null ? `last seen ${lat.toFixed(4)}, ${lon.toFixed(4)}` : 'no location available'

  await notifyOrgRoles(supabase, session!.orgId, ['org_admin', 'team_leader'], {
    title: '🆘 PANIC',
    body: `${who} triggered a duress alert — ${loc}.`,
    priority: 'urgent',
    tags: 'rotating_light',
  })

  return NextResponse.json({ success: true, panic_id: panic.id })
}
