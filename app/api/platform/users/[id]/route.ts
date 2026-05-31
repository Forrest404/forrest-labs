import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'
import { logAdminAction } from '@/lib/admin/audit'

// Platform-operator user actions within an NGO: suspend / reactivate / remove an
// individual ngo_user. Admin-gated; every action is audit-logged. Suspension is
// enforced at login + per-request by the existing getNgoSession revocation check.

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSessionFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  const { id } = await params

  let action = ''
  try {
    action = ((await request.json())?.action ?? '').toString()
  } catch { /* no body */ }
  if (action !== 'suspend' && action !== 'reactivate') {
    return NextResponse.json({ error: 'action must be "suspend" or "reactivate"' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const newStatus = action === 'suspend' ? 'suspended' : 'active'
  const { data: user, error } = await supabase
    .from('ngo_users')
    .update({ status: newStatus })
    .eq('id', id)
    .select('id, email, org_id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await logAdminAction({
    action: action === 'suspend' ? 'ngo_user_suspended' : 'ngo_user_reactivated',
    entityType: 'ngo_user',
    entityId: id,
    sessionId: admin.sessionId,
    details: { email: user.email, org_id: user.org_id, note: `User ${action}d` },
  })

  return NextResponse.json({ success: true, status: newStatus })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSessionFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  const { id } = await params

  const supabase = createServiceClient()
  const { data: user, error } = await supabase
    .from('ngo_users')
    .delete()
    .eq('id', id)
    .select('id, email, org_id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await logAdminAction({
    action: 'ngo_user_removed',
    entityType: 'ngo_user',
    entityId: id,
    sessionId: admin.sessionId,
    details: { email: user.email, org_id: user.org_id, note: 'User removed' },
  })

  return NextResponse.json({ success: true })
}
