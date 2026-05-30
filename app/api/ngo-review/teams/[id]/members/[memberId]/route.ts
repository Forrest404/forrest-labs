import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

// NOUR-internal: remove a member from any team (admin-gated, cross-org).
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
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not remove member' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
