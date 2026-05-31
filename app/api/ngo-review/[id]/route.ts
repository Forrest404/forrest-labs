import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'
import { logAdminAction } from '@/lib/admin/audit'

// NOUR-internal: permanently delete an NGO and all its data. Cascades (per the
// foundation migration's FKs) remove its users, teams, members, dispatches,
// check-ins, panics, roll calls, etc. Irreversible.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSessionFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  const { id } = await params

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('ngo_organisations')
    .delete()
    .eq('id', id)
    .select('id, name')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })

  console.log(`[ngo-review] DELETED org "${data.name}" (${id}) and all its data.`)

  await logAdminAction({
    action: 'ngo_org_deleted',
    entityType: 'ngo_organisation',
    entityId: id,
    sessionId: admin.sessionId,
    details: { org: data.name, note: 'Permanently deleted org and all its data' },
  })

  return NextResponse.json({ success: true })
}
