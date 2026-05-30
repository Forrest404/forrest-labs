import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'
import { revokeOrphanedMemberLogin } from '@/lib/ngo-safety'

// NOUR-internal: remove a member from any team (admin-gated, cross-org). Mirrors
// the org-side behaviour: a removed field coordinator with no remaining team loses
// their login too.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  const admin = await getSessionFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  const { id, memberId } = await params

  const supabase = createServiceClient()
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
