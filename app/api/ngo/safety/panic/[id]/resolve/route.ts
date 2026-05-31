import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

// Resolve a panic: a leader/admin marks it handled WITH a required outcome note. A
// panic never auto-closes on a timer — only a human responder can resolve it. The
// board only surfaces unresolved panics, so this clears it from the live view.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params

  let body: { resolution_note?: string }
  try { body = await request.json() } catch { body = {} }
  const note = String(body.resolution_note ?? '').trim()
  if (note.length < 3) {
    return NextResponse.json({ error: 'A short outcome note is required to resolve a panic' }, { status: 400 })
  }

  const supabase = createServiceClient()
  // The panic's user must belong to the caller's org. (panic_events has two FKs to
  // ngo_users — ngo_user_id and resolved_by — so an embed is ambiguous; query plainly.)
  const { data: panic } = await supabase
    .from('panic_events')
    .select('id, resolved_at, org_id, ngo_user_id')
    .eq('id', id)
    .maybeSingle()
  if (!panic) return NextResponse.json({ error: 'Panic not found' }, { status: 404 })
  let orgId = (panic as any).org_id as string | null
  if (!orgId) {
    const { data: owner } = await supabase.from('ngo_users').select('org_id').eq('id', panic.ngo_user_id).maybeSingle()
    orgId = owner?.org_id ?? null
  }
  if (orgId !== session!.orgId) return NextResponse.json({ error: 'Panic not found' }, { status: 404 })
  if (panic.resolved_at) return NextResponse.json({ success: true, already: true })

  const update: Record<string, unknown> = { resolved_at: new Date().toISOString(), resolved_by: session!.userId, resolution_note: note }
  let { error } = await supabase.from('panic_events').update(update).eq('id', id)
  if (error && (error.code === 'PGRST204' || error.code === '42703')) {
    // resolution_note column absent (pre-revamp) — still resolve, drop the note.
    ({ error } = await supabase.from('panic_events').update({ resolved_at: update.resolved_at, resolved_by: session!.userId }).eq('id', id))
  }
  if (error) return NextResponse.json({ error: 'Could not resolve panic' }, { status: 500 })
  return NextResponse.json({ success: true })
}
