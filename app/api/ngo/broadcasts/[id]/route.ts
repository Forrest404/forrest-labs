import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

// GET /api/ngo/broadcasts/[id] — recipient roster for a broadcast (leaders/admins), so the
// sender can see who has and hasn't acknowledged (roll-call style). Org-scoped.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params
  const supabase = createServiceClient()

  const { data: bcast } = await supabase
    .from('broadcasts').select('id, urgency').eq('id', id).eq('org_id', session!.orgId).maybeSingle()
  if (!bcast) return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })

  const { data: recs } = await supabase
    .from('broadcast_recipients')
    .select('delivered_at, acknowledged_at, ngo_users ( full_name )')
    .eq('broadcast_id', id)
    .eq('org_id', session!.orgId)

  const recipients = (recs ?? []).map((r: any) => {
    const u = Array.isArray(r.ngo_users) ? r.ngo_users[0] : r.ngo_users
    return { name: u?.full_name ?? 'Unknown', delivered: !!r.delivered_at, acknowledged: !!r.acknowledged_at }
  }).sort((a: any, b: any) => a.name.localeCompare(b.name))

  return NextResponse.json({ urgency: bcast.urgency, recipients }, { headers: { 'Cache-Control': 'no-store' } })
}

const MAX_BODY = 280

// PATCH /api/ngo/broadcasts/[id] — correct the body or WITHDRAW a broadcast (leaders/admins,
// own org). Withdraw is a soft-delete: the message leaves the in-app feed (leaders + field) but
// the row is kept for audit. It does NOT un-send the original push, which already went out.
//   body { withdraw: true }        → set withdrawn_at = now()
//   body { message: "corrected…" } → update body + set edited_at = now() (no new push fired)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params
  let body: { message?: string; withdraw?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const supabase = createServiceClient()
  // Scope to the caller's org and read current withdrawn state.
  const { data: existing } = await supabase
    .from('broadcasts').select('id, withdrawn_at').eq('id', id).eq('org_id', session!.orgId).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })

  if (body.withdraw === true) {
    if (existing.withdrawn_at) return NextResponse.json({ success: true, already: true }) // idempotent
    const { error } = await supabase.from('broadcasts').update({ withdrawn_at: new Date().toISOString() }).eq('id', id).eq('org_id', session!.orgId)
    if (error) return NextResponse.json({ error: 'Could not withdraw broadcast' }, { status: 500 })
    return NextResponse.json({ success: true, withdrawn: true })
  }

  if (body.message !== undefined) {
    if (existing.withdrawn_at) return NextResponse.json({ error: 'This broadcast was withdrawn and can no longer be edited.' }, { status: 409 })
    const message = String(body.message).trim()
    if (!message) return NextResponse.json({ error: 'A message is required.' }, { status: 400 })
    if (message.length > MAX_BODY) return NextResponse.json({ error: `Message is too long (max ${MAX_BODY} characters).` }, { status: 400 })
    const { error } = await supabase.from('broadcasts').update({ body: message, edited_at: new Date().toISOString() }).eq('id', id).eq('org_id', session!.orgId)
    if (error) return NextResponse.json({ error: 'Could not update broadcast' }, { status: 500 })
    return NextResponse.json({ success: true, edited: true })
  }

  return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
}
