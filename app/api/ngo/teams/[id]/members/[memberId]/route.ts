import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

// Remove a roster member. Scoped to the caller's org via the parent team.
// (Any linked ngo_users row is left intact — its team_members.ngo_user_id
// FK is set null on member delete; revoking a login is a separate concern.)

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id, memberId } = await params

  const supabase = createServiceClient()
  const { data: team } = await supabase
    .from('ngo_teams')
    .select('id')
    .eq('id', id)
    .eq('org_id', session!.orgId)
    .maybeSingle()
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('team_members')
    .delete()
    .eq('id', memberId)
    .eq('team_id', id)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Could not remove member' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
