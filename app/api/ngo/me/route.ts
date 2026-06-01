import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

const LANGS = ['en', 'fr', 'ar']

// The signed-in user's OWN account. Every read/write is scoped to session.userId — a user
// can only ever touch their own row. Available to all NGO roles (incl. field coordinator).
export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader', 'field_coordinator'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('ngo_users')
    .select('full_name, email, phone, role, language, notif_push, notif_sms, quiet_start, quiet_end, password_hash, pin_hash, totp_enabled')
    .eq('id', session!.userId)
    .maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  return NextResponse.json({
    account: {
      full_name: data.full_name, email: data.email, phone: data.phone, role: data.role,
      language: (data as any).language ?? null,
      notif_push: (data as any).notif_push ?? true,
      notif_sms: (data as any).notif_sms ?? true,
      quiet_start: (data as any).quiet_start ?? null,
      quiet_end: (data as any).quiet_end ?? null,
      has_password: !!data.password_hash,
      has_pin: !!data.pin_hash,
      totp_enabled: !!(data as any).totp_enabled,
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}

// PATCH own profile + notification prefs. Additive columns are saved tolerantly so a
// not-yet-applied migration doesn't 500 the whole save.
export async function PATCH(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader', 'field_coordinator'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const update: Record<string, unknown> = {}
  if (body.full_name !== undefined) {
    const n = String(body.full_name).trim()
    if (!n) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    update.full_name = n.slice(0, 160)
  }
  if (body.phone !== undefined) update.phone = body.phone ? String(body.phone).trim().slice(0, 40) : null
  if (body.language !== undefined) {
    if (body.language && !LANGS.includes(String(body.language))) return NextResponse.json({ error: 'Invalid language' }, { status: 400 })
    update.language = body.language || null
  }
  if (body.notif_push !== undefined) update.notif_push = !!body.notif_push
  if (body.notif_sms !== undefined) update.notif_sms = !!body.notif_sms
  for (const k of ['quiet_start', 'quiet_end'] as const) {
    if (body[k] !== undefined) {
      if (body[k] === null || body[k] === '') { update[k] = null; continue }
      const v = Number(body[k])
      if (!Number.isInteger(v) || v < 0 || v > 1439) return NextResponse.json({ error: 'Quiet hours must be 0–1439 minutes' }, { status: 400 })
      update[k] = v
    }
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('ngo_users').update(update).eq('id', session!.userId)
  if (error) return NextResponse.json({ error: 'Could not save your settings' }, { status: 500 })
  return NextResponse.json({ success: true })
}

// POST { action: 'logout_all' } — sign this user out of every device by bumping their own
// token_version (every existing token is rejected on its next request). Stateless JWTs
// mean we can't enumerate individual devices — this is the global revoke.
export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader', 'field_coordinator'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  let body: any
  try { body = await request.json() } catch { body = {} }
  if (body.action !== 'logout_all') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: cur, error: readErr } = await supabase.from('ngo_users').select('token_version').eq('id', session!.userId).maybeSingle()
  if (readErr || !cur || typeof (cur as any).token_version !== 'number') {
    return NextResponse.json({ error: 'Sign-out-everywhere isn’t available yet — apply the token_version migration.' }, { status: 503 })
  }
  const { error } = await supabase.from('ngo_users').update({ token_version: (cur as any).token_version + 1 }).eq('id', session!.userId)
  if (error) return NextResponse.json({ error: 'Could not sign out other devices' }, { status: 500 })
  return NextResponse.json({ success: true })
}
