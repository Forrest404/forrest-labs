import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

// Restore a revoked (or pending) NGO: approve the org and reactivate all its users.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSessionFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  const { id } = await params

  const supabase = createServiceClient()
  const { data: org, error } = await supabase
    .from('ngo_organisations')
    .update({ status: 'approved' })
    .eq('id', id)
    .select('id, name')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Restore failed' }, { status: 500 })
  if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })

  const { data: users } = await supabase
    .from('ngo_users')
    .update({ status: 'active' })
    .eq('org_id', id)
    .select('id')

  console.log(`[ngo-review] RESTORED org "${org.name}" (${id}); reactivated ${users?.length ?? 0} users.`)
  return NextResponse.json({ success: true, users_reactivated: users?.length ?? 0 })
}
