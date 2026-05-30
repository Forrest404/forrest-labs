import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

// Admin-gated denial of a pending NGO org. The status CHECK allows only
// pending|approved|suspended (no 'rejected'), so a denial sets 'suspended' —
// the login route already blocks suspended orgs with a clear message.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getSessionFromRequest(request)
  if (!admin) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
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

  console.log(`[ngo-review] DENIED org "${org.name}" (${id}). Its admin can no longer sign in.`)

  return NextResponse.json({ success: true })
}
