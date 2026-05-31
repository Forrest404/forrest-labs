import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'
import { logAdminAction } from '@/lib/admin/audit'

// Admin-gated denial of a pending NGO org. The status CHECK allows only
// pending|approved|suspended (no 'rejected'), so a denial sets 'suspended' —
// the login route already blocks suspended orgs with a clear message. A reason is
// REQUIRED and recorded in the audit log for accountability (the status enum has
// nowhere to store it, so it lives in admin_audit_log.details).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getSessionFromRequest(request)
  if (!admin) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }

  let reason = ''
  try {
    reason = ((await request.json())?.reason ?? '').toString().trim()
  } catch { /* no body */ }
  if (!reason) {
    return NextResponse.json({ error: 'A rejection reason is required.' }, { status: 400 })
  }

  const { id } = await params
  const supabase = createServiceClient()

  const { data: org, error } = await supabase
    .from('ngo_organisations')
    .update({ status: 'suspended' })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id, name')
    .maybeSingle()

  if (error) {
    console.error('NGO denial failed:', error)
    return NextResponse.json({ error: 'Denial failed' }, { status: 500 })
  }
  if (!org) {
    return NextResponse.json({ error: 'Organisation not found or not pending' }, { status: 404 })
  }

  console.log(`[ngo-review] DENIED org "${org.name}" (${id}). Reason: ${reason}`)

  await logAdminAction({
    action: 'ngo_org_rejected',
    entityType: 'ngo_organisation',
    entityId: id,
    sessionId: admin.sessionId,
    details: { org: org.name, reason, note: `Rejected: ${reason}` },
  })

  return NextResponse.json({ success: true })
}
