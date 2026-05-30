import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

// Resolve a panic: a leader/admin marks it handled. The board only surfaces
// unresolved panics, so this clears it from the live view. Scoped to the org via
// the panicking user (panic_events has no org_id column).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params
  const supabase = createServiceClient()

  // The panic's user must belong to the caller's org. (panic_events has two FKs to
  // ngo_users — ngo_user_id and resolved_by — so an embed is ambiguous; query plainly.)
  const { data: panic } = await supabase
    .from('panic_events')
    .select('id, resolved_at, ngo_user_id')
    .eq('id', id)
    .maybeSingle()
  if (!panic) return NextResponse.json({ error: 'Panic not found' }, { status: 404 })
  const { data: owner } = await supabase.from('ngo_users').select('org_id').eq('id', panic.ngo_user_id).maybeSingle()
  if (!owner || owner.org_id !== session!.orgId) return NextResponse.json({ error: 'Panic not found' }, { status: 404 })
  if (panic.resolved_at) return NextResponse.json({ success: true, already: true })

  const { error } = await supabase
    .from('panic_events')
    .update({ resolved_at: new Date().toISOString(), resolved_by: session!.userId })
    .eq('id', id)
  if (error) return NextResponse.json({ error: 'Could not resolve panic' }, { status: 500 })
  return NextResponse.json({ success: true })
}
