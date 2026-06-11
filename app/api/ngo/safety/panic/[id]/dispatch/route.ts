import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { notifyTeam } from '@/lib/ngo-notify'

// Send a crew to a panicking coordinator: a leader/admin picks a team; we notify
// that team (push + SMS) to open NOUR for the location, and record a trackable
// dispatch (no cluster — a panic isn't an incident) that shows in /ngo/dispatch and
// can be advanced/recalled like any other. The dispatch is LINKED to the panic
// (panic_id) so the responder sees the live location from the panic_events row —
// which retention purges — instead of a name + coordinates frozen in the note (C1).
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
  const { data: panic } = await supabase.from('panic_events').select('id, ngo_user_id').eq('id', id).maybeSingle()
  if (!panic) return NextResponse.json({ error: 'Panic not found' }, { status: 404 })
  const { data: owner } = await supabase.from('ngo_users').select('org_id').eq('id', panic.ngo_user_id).maybeSingle()
  if (!owner || owner.org_id !== session!.orgId) return NextResponse.json({ error: 'Panic not found' }, { status: 404 })
  const { data: team } = await supabase.from('ngo_teams').select('id, name').eq('id', teamId).eq('org_id', session!.orgId).maybeSingle()
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  // Record as a dispatch (cluster_id null — this responds to a panic, not an incident).
  // The note is identity-free; the live location comes from the linked panic row.
  const row: Record<string, unknown> = {
    org_id: session!.orgId, cluster_id: null, team_id: teamId, assigned_by: session!.userId,
    status: 'assigned', note: 'Panic response', panic_id: panic.id,
  }
  let { error } = await supabase.from('ngo_dispatches').insert(row)
  // Pre-migration fallback: panic_id column not there yet → insert without it.
  if (error && (error.code === '42703' || error.code === 'PGRST204')) {
    delete row.panic_id
    ;({ error } = await supabase.from('ngo_dispatches').insert(row))
  }
  if (error) return NextResponse.json({ error: 'Could not dispatch' }, { status: 500 })

  // Sanitised broadcast (security C1): the relay carries only a generic notice; the
  // responding team opens NOUR to see the worker's live location.
  await notifyTeam(supabase, teamId, {
    event: 'panic_dispatch',
    title: '🆘 Panic response',
    body: `${team.name}: panic response assigned. Open NOUR for the location.`,
    priority: 'urgent', tags: 'rotating_light',
  })

  return NextResponse.json({ success: true })
}
