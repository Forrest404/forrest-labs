import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { notifyUsers } from '@/lib/ngo-notify'

// Transfer a roster member from one team to another within the same org. We MOVE the same
// team_members row (just its team_id) rather than delete + recreate, so the operator's linked
// login, role, phone and emergency contact follow them and nothing is ever orphaned. Both the
// source and target team must belong to the caller's org.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id, memberId } = await params

  let body: { target_team_id?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const targetTeamId = String(body.target_team_id ?? '').trim()
  if (!targetTeamId) return NextResponse.json({ error: 'Target team is required' }, { status: 400 })
  if (targetTeamId === id) return NextResponse.json({ error: 'Member is already on that team' }, { status: 400 })

  const supabase = createServiceClient()
  // Both the source and the destination team must be in the caller's org — one query, scoped.
  const { data: teams } = await supabase
    .from('ngo_teams').select('id, name').eq('org_id', session!.orgId).in('id', [id, targetTeamId])
  const source = teams?.find((t: { id: string }) => t.id === id)
  const target = teams?.find((t: { id: string }) => t.id === targetTeamId)
  if (!source || !target) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('team_members')
    .update({ team_id: targetTeamId })
    .eq('id', memberId)
    .eq('team_id', id) // confirms the member really is on the source team before moving
    .select('id, name, ngo_user_id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not move member' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  // If the operator has app access, tell them their team changed — their dispatch/field view
  // follows the new team. Normal urgency: an operational change honours prefs/quiet hours
  // rather than forcing through like a safety alert.
  if (data.ngo_user_id) {
    await notifyUsers(supabase, session!.orgId, [data.ngo_user_id], {
      event: 'team_change',
      title: 'Team changed',
      body: `You've been moved to ${target.name}.`,
    })
  }

  return NextResponse.json({ success: true, member: { id: data.id, name: data.name }, target: { id: target.id, name: target.name } })
}
