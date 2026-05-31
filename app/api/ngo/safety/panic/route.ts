import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { resolveTeamId } from '@/lib/ngo-safety'
import { notifyOrgRoles } from '@/lib/ngo-notify'

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
