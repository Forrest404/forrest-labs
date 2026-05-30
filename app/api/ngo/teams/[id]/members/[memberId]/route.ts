import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { revokeOrphanedMemberLogin } from '@/lib/ngo-safety'

// Remove a roster member. Scoped to the caller's org via the parent team. If the
// member had a field-coordinator login and is now on no team, their login is
// deleted too — so removal actually revokes their dashboard access.

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
    .select('id, ngo_user_id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Could not remove member' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  const accessRevoked = await revokeOrphanedMemberLogin(supabase, data.ngo_user_id)
  return NextResponse.json({ success: true, access_revoked: accessRevoked })
}
