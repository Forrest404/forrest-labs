import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

// A responder acknowledges a panic — records who/when so the chain knows it's seen
// (and the escalation loop stops widening it). Does NOT resolve it. Org-scoped.
// First acknowledgement wins; a second call is a no-op.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params
  const supabase = createServiceClient()

  const { data: panic } = await supabase
    .from('panic_events').select('id, org_id, acknowledged_at, ngo_user_id').eq('id', id).maybeSingle()
  if (!panic) return NextResponse.json({ error: 'Panic not found' }, { status: 404 })
  // Scope: prefer org_id, fall back to the panicking user's org (pre-backfill safety).
  let orgId = (panic as any).org_id as string | null
  if (!orgId) {
    const { data: owner } = await supabase.from('ngo_users').select('org_id').eq('id', panic.ngo_user_id).maybeSingle()
    orgId = owner?.org_id ?? null
  }
  if (orgId !== session!.orgId) return NextResponse.json({ error: 'Panic not found' }, { status: 404 })
  if (panic.acknowledged_at) return NextResponse.json({ success: true, already: true })

  const { error } = await supabase
    .from('panic_events')
    .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: session!.userId })
    .eq('id', id)
  if (error) return NextResponse.json({ error: 'Could not acknowledge panic' }, { status: 500 })
  return NextResponse.json({ success: true })
}
