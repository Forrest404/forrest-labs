import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { notifyTeam } from '@/lib/ngo-notify'
import { geocode, mapLink } from '@/lib/ngo-dispatch'

// Send a crew to a panicking coordinator: a leader/admin picks a team; we notify
// that team (push + SMS) with the coordinator's last location + a map link, and
// record a trackable dispatch (no cluster — a panic isn't an incident) that shows
// in /ngo/dispatch and can be advanced/recalled like any other.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params

  let body: { team_id?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const teamId = String(body.team_id ?? '')
  if (!teamId) return NextResponse.json({ error: 'team_id required' }, { status: 400 })

  const supabase = createServiceClient()

  // Panic must belong to the caller's org (via its user). team must too.
  const { data: panic } = await supabase.from('panic_events').select('id, last_lat, last_lon, ngo_user_id').eq('id', id).maybeSingle()
  if (!panic) return NextResponse.json({ error: 'Panic not found' }, { status: 404 })
  const { data: owner } = await supabase.from('ngo_users').select('org_id, full_name').eq('id', panic.ngo_user_id).maybeSingle()
  if (!owner || owner.org_id !== session!.orgId) return NextResponse.json({ error: 'Panic not found' }, { status: 404 })
  const { data: team } = await supabase.from('ngo_teams').select('id, name').eq('id', teamId).eq('org_id', session!.orgId).maybeSingle()
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const hasLoc = panic.last_lat != null && panic.last_lon != null
  const place = hasLoc ? await geocode(panic.last_lat, panic.last_lon) : 'location unknown'
  const link = hasLoc ? mapLink(panic.last_lat, panic.last_lon) : ''
  const who = owner.full_name ?? 'a field coordinator'

  // Record as a dispatch (cluster_id null — this responds to a panic, not an incident).
  await supabase.from('ngo_dispatches').insert({
    org_id: session!.orgId, cluster_id: null, team_id: teamId, assigned_by: session!.userId,
    status: 'assigned', note: `Panic response — ${who} @ ${place}${link ? ` ${link}` : ''}`,
  })

  // Sanitised broadcast (security C1): name/place/map link stay in the dispatch note
  // (authenticated dashboard) above; the relay carries only a generic notice.
  await notifyTeam(supabase, teamId, {
    event: 'panic_dispatch',
    title: '🆘 Panic response',
    body: `${team.name}: panic response assigned. Open NOUR for the location.`,
    priority: 'urgent', tags: 'rotating_light',
  })

  return NextResponse.json({ success: true })
}
