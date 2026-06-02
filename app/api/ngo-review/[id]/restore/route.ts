import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'
import { logAdminAction } from '@/lib/admin/audit'

// Restore a revoked (or pending) NGO: approve the org and reactivate all its users.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSessionFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  const { id } = await params

  const supabase = createServiceClient()
  // Approve the org and clear any deleted_at (so an org that closed itself is fully reinstated).
  // deleted_at is additive — fall back to a status-only update if the column isn't applied yet.
  let res: any = await supabase
    .from('ngo_organisations')
    .update({ status: 'approved', deleted_at: null })
    .eq('id', id)
    .select('id, name')
    .maybeSingle()
  if (res.error && (res.error.code === '42703' || res.error.code === 'PGRST204')) {
    res = await supabase.from('ngo_organisations').update({ status: 'approved' }).eq('id', id).select('id, name').maybeSingle()
  }
  const { data: org, error } = res
  if (error) return NextResponse.json({ error: 'Restore failed' }, { status: 500 })
  if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })

  const { data: users } = await supabase
    .from('ngo_users')
    .update({ status: 'active' })
    .eq('org_id', id)
    .select('id')

  console.log(`[ngo-review] RESTORED org "${org.name}" (${id}); reactivated ${users?.length ?? 0} users.`)

  await logAdminAction({
    action: 'ngo_org_reactivated',
    entityType: 'ngo_organisation',
    entityId: id,
    sessionId: admin.sessionId,
    details: { org: org.name, users_reactivated: users?.length ?? 0, note: `Reactivated org; ${users?.length ?? 0} user(s) restored` },
  })

  return NextResponse.json({ success: true, users_reactivated: users?.length ?? 0 })
}
