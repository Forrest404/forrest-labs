import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { logAdminAction } from '@/lib/admin/audit'

// Manage the abuse blocklist. POST upserts a flag/block (or marks an entry reviewed);
// DELETE removes one. Admin-only. Hashes only — raw IPs/sessions are never handled.
const TYPES = new Set(['ip', 'session'])

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  let body: { identifier_type?: string; identifier_hash?: string; action?: string; reason?: string } = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const type = String(body.identifier_type ?? '')
  const hash = String(body.identifier_hash ?? '').trim()
  const action = String(body.action ?? '')
  if (!TYPES.has(type) || !hash) return NextResponse.json({ error: 'identifier_type and identifier_hash are required' }, { status: 400 })

  const supabase = createServiceClient()

  // "reviewed" just marks an existing entry as looked-at (a watch acknowledgement).
  if (action === 'reviewed') {
    await supabase.from('blocked_identifiers').update({ reviewed: true, updated_at: new Date().toISOString() })
      .eq('identifier_type', type).eq('identifier_hash', hash)
    await logAdminAction({ action: 'abuse_reviewed', entityType: type === 'ip' ? 'ip_hash' : 'session', entityId: hash.slice(0, 16), sessionId: session.sessionId, details: { type } })
    return NextResponse.json({ success: true })
  }

  if (action !== 'flag' && action !== 'block') {
    return NextResponse.json({ error: 'action must be flag, block, or reviewed' }, { status: 400 })
  }

  const reason = body.reason ? String(body.reason).slice(0, 500) : null
  const { error } = await supabase.from('blocked_identifiers').upsert({
    identifier_type: type, identifier_hash: hash, action, reason,
    created_by: session.sessionId.slice(0, 8) + '...', updated_at: new Date().toISOString(),
  }, { onConflict: 'identifier_type,identifier_hash' })
  if (error) return NextResponse.json({ error: 'Could not save (is the migration applied?)' }, { status: 500 })

  await logAdminAction({
    action: action === 'block' ? 'abuse_blocked' : 'abuse_flagged',
    entityType: type === 'ip' ? 'ip_hash' : 'session',
    entityId: hash.slice(0, 16),
    sessionId: session.sessionId,
    details: { type, reason: reason ?? undefined },
  })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const url = new URL(request.url)
  const type = url.searchParams.get('identifier_type') ?? ''
  const hash = url.searchParams.get('identifier_hash') ?? ''
  if (!TYPES.has(type) || !hash) return NextResponse.json({ error: 'identifier_type and identifier_hash are required' }, { status: 400 })

  const supabase = createServiceClient()
  await supabase.from('blocked_identifiers').delete().eq('identifier_type', type).eq('identifier_hash', hash)
  await logAdminAction({ action: 'abuse_unblocked', entityType: type === 'ip' ? 'ip_hash' : 'session', entityId: hash.slice(0, 16), sessionId: session.sessionId, details: { type } })
  return NextResponse.json({ success: true })
}
