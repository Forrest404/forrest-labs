import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'
import { logAdminAction } from '@/lib/admin/audit'

// Revoke an NGO's access: suspend the org AND every user in it. Because
// getNgoSession re-checks status per request, this logs out anyone signed in and
// blocks new logins. Reversible via /restore.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSessionFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  const { id } = await params

  const supabase = createServiceClient()
  const { data: org, error } = await supabase
    .from('ngo_organisations')
    .update({ status: 'suspended' })
    .eq('id', id)
    .select('id, name')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Revoke failed' }, { status: 500 })
  if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })

  const { data: users } = await supabase
    .from('ngo_users')
    .update({ status: 'suspended' })
    .eq('org_id', id)
    .select('id')

  console.log(`[ngo-review] REVOKED org "${org.name}" (${id}); suspended ${users?.length ?? 0} users.`)

  await logAdminAction({
    action: 'ngo_org_suspended',
    entityType: 'ngo_organisation',
    entityId: id,
    sessionId: admin.sessionId,
    details: { org: org.name, users_suspended: users?.length ?? 0, note: `Suspended org; ${users?.length ?? 0} user(s) blocked` },
  })

  return NextResponse.json({ success: true, users_suspended: users?.length ?? 0 })
}
