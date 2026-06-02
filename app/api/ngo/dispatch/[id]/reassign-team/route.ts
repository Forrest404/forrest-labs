import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { notifyTeam } from '@/lib/ngo-notify'

// Reassign an incident to a DIFFERENT team: repoint the dispatch's team_id, reset to
// 'assigned' + clear progression timestamps, record the reason, dispatch the new team and
// stand the previous team down. (The sibling /reassign route changes the INCIDENT and keeps
// the team; this one changes the TEAM and keeps the incident.)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params

  let body: { team_id?: string; reason?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const teamId = String(body.team_id ?? '')
  if (!teamId) return NextResponse.json({ error: 'team_id required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: d } = await supabase.from('ngo_dispatches').select('id, org_id, team_id, note').eq('id', id).eq('org_id', session!.orgId).maybeSingle()
  if (!d || d.org_id !== session!.orgId) return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
  if (teamId === d.team_id) return NextResponse.json({ error: 'Already assigned to that team' }, { status: 400 })

  // The target team must belong to the caller's org.
  const { data: team } = await supabase.from('ngo_teams').select('id').eq('id', teamId).eq('org_id', session!.orgId).maybeSingle()
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const prevTeamId = d.team_id
  const reason = body.reason ? String(body.reason).slice(0, 300) : null
  const note = [d.note, reason ? `Team reassigned: ${reason}` : 'Team reassigned'].filter(Boolean).join(' · ')

  const { error } = await supabase.from('ngo_dispatches').update({
    team_id: teamId,
    status: 'assigned',
    assigned_by: session!.userId,
    assigned_at: new Date().toISOString(),
    en_route_at: null,
    on_scene_at: null,
    done_at: null,
    note,
  }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Could not reassign' }, { status: 500 })

  // Dispatch the new team and stand the previous one down. Sanitised broadcast (security C1):
  // no coordinates/place/map link on the relay — each team opens NOUR to see the location.
  await notifyTeam(supabase, teamId, {
    event: 'dispatch',
    title: '🚑 Dispatch',
    body: 'New dispatch assigned to your team. Open NOUR for the location.',
    priority: 'urgent', tags: 'ambulance',
  })
  if (prevTeamId) {
    await notifyTeam(supabase, prevTeamId, {
      event: 'dispatch',
      title: '↩️ Stand down',
      body: `Stand down — this incident was reassigned to another team${reason ? `: ${reason}` : ''}.`,
      priority: 'urgent', tags: 'leftwards_arrow_with_hook',
    })
  }

  return NextResponse.json({ success: true })
}
