import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { notifyOrgRoles } from '@/lib/ngo-notify'

// False-alarm cancel — only the panicking worker, and ONLY within the brief cancel
// window after firing. After the window the alert locks: the field worker can no
// longer clear it (so a coerced person can't be forced to dismiss their own alert) —
// only a responder may resolve it. Cancelling notifies responders it was a false alarm.
const CANCEL_WINDOW_MS = 12_000 // ~10s shown + a little grace for round-trips

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['field_coordinator'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params
  const supabase = createServiceClient()

  const { data: panic } = await supabase
    .from('panic_events').select('id, org_id, ngo_user_id, created_at, resolved_at, cancelled_at').eq('id', id).maybeSingle()
  if (!panic || panic.ngo_user_id !== session!.userId) {
    return NextResponse.json({ error: 'Panic not found' }, { status: 404 })
  }
  if (panic.cancelled_at) return NextResponse.json({ success: true, already: true })
  if (panic.resolved_at) return NextResponse.json({ error: 'Already resolved by a responder' }, { status: 409 })

  const elapsed = Date.now() - new Date(panic.created_at).getTime()
  if (elapsed > CANCEL_WINDOW_MS) {
    return NextResponse.json({ error: 'Cancel window closed — only a responder can resolve this now', locked: true }, { status: 409 })
  }

  const { error } = await supabase.from('panic_events').update({ cancelled_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Could not cancel' }, { status: 500 })

  // Tell responders it was a false alarm (best-effort). Sanitised (security C1): no
  // name on the relay; the board shows which alert cleared.
  const orgId = (panic as any).org_id ?? session!.orgId
  await notifyOrgRoles(supabase, orgId, ['org_admin', 'team_leader'], {
    title: '✅ Panic cancelled',
    body: 'A field worker cancelled their duress alert — false alarm.',
    priority: 'high', tags: 'white_check_mark',
  })
  return NextResponse.json({ success: true })
}
