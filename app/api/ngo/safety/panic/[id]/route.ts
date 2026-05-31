import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession } from '@/lib/ngo-auth'

// Set the optional reason on a panic (tap-only chips on the field device). The
// panicking worker may tag their own active alert; a leader/admin may tag any in
// their org. Additive — the alert is already complete without it.
const REASONS = ['injured', 'under_fire', 'detained', 'vehicle', 'medical', 'moving']

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params

  let body: { reason?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const reason = body.reason === null || body.reason === '' ? null : String(body.reason ?? '')
  if (reason !== null && !REASONS.includes(reason)) {
    return NextResponse.json({ error: 'Invalid reason' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: panic } = await supabase
    .from('panic_events').select('id, org_id, ngo_user_id').eq('id', id).maybeSingle()
  if (!panic) return NextResponse.json({ error: 'Panic not found' }, { status: 404 })

  // Authorise: the owner, or a leader/admin in the panic's org.
  const isOwner = panic.ngo_user_id === session.userId
  const isLeader = session.role === 'org_admin' || session.role === 'team_leader'
  let orgId = (panic as any).org_id as string | null
  if (!orgId) {
    const { data: owner } = await supabase.from('ngo_users').select('org_id').eq('id', panic.ngo_user_id).maybeSingle()
    orgId = owner?.org_id ?? null
  }
  if (!isOwner && !(isLeader && orgId === session.orgId)) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  const { error } = await supabase.from('panic_events').update({ reason }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Could not set reason' }, { status: 500 })
  return NextResponse.json({ success: true, reason })
}
