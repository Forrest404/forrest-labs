import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { notifyOrgRoles } from '@/lib/ngo-notify'
import { rateLimit, tooMany, MUTATION_MAX, MUTATION_WINDOW } from '@/lib/rate-limit'

// GET — recent broadcasts for this org (managers).
export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('broadcasts')
    .select('id, body, created_at')
    .eq('org_id', session!.orgId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ broadcasts: [] })
  return NextResponse.json({ broadcasts: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

// POST — send a broadcast to all field staff (NORMAL urgency: respects per-user prefs +
// quiet hours + off-duty, and is flood-protected). Records the broadcast, then notifies.
export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const supabase = createServiceClient()

  // Cap org-wide broadcast fan-out per sender (20 / 5 min).
  const limit = await rateLimit(supabase, { bucket: 'mut:broadcast', identifier: session!.userId, max: MUTATION_MAX, windowSec: MUTATION_WINDOW })
  if (!limit.ok) return tooMany(limit.retryAfter)

  let body: { message?: string } = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const message = String(body.message ?? '').trim()
  if (!message) return NextResponse.json({ error: 'A message is required.' }, { status: 400 })
  if (message.length > 600) return NextResponse.json({ error: 'Message is too long (max 600 characters).' }, { status: 400 })

  const { error } = await supabase.from('broadcasts').insert({ org_id: session!.orgId, sender_id: session!.userId, body: message })
  if (error) return NextResponse.json({ error: 'Could not save the broadcast.' }, { status: 500 })

  // NORMAL to field staff. The message body IS the content (intentional); scrubSensitive
  // still strips any coordinates so a broadcast can't leak a location.
  await notifyOrgRoles(supabase, session!.orgId, ['field_coordinator'], {
    event: 'broadcast',
    title: '📢 Broadcast',
    body: message,
    tags: 'loudspeaker',
  })
  return NextResponse.json({ success: true })
}
