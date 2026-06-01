import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

// Per-event notification preferences for the TUNABLE (NORMAL/LOW) events only. Safety-
// critical events are never represented here, so they can't be muted. user prefs override
// org defaults; absent rows fall back to a built-in default.
const TUNABLE = ['new_incident', 'broadcast', 'report_ready']
const BUILTIN: Record<string, { push: boolean; sms: boolean; email: boolean }> = {
  new_incident: { push: true, sms: false, email: false },
  broadcast: { push: true, sms: false, email: false },
  report_ready: { push: false, sms: false, email: true },
}

export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader', 'field_coordinator'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const { data: userRows } = await supabase.from('user_notification_prefs').select('event_type, push, sms, email').eq('ngo_user_id', session!.userId)
  const userMap: Record<string, any> = {}
  for (const r of userRows ?? []) userMap[r.event_type] = { push: r.push, sms: r.sms, email: r.email }

  let org: Record<string, any> | undefined
  if (session!.role === 'org_admin') {
    const { data: orgRows } = await supabase.from('org_notification_defaults').select('event_type, enabled, push, sms, email').eq('org_id', session!.orgId)
    org = {}
    for (const e of TUNABLE) {
      const row = (orgRows ?? []).find((r: any) => r.event_type === e)
      org[e] = row ? { enabled: row.enabled, push: row.push, sms: row.sms, email: row.email } : { enabled: true, ...BUILTIN[e] }
    }
  }
  const user: Record<string, any> = {}
  for (const e of TUNABLE) user[e] = userMap[e] ?? { ...BUILTIN[e] }

  return NextResponse.json({ events: TUNABLE, user, org }, { headers: { 'Cache-Control': 'no-store' } })
}

// PUT { scope: 'user'|'org', event, push, sms, email, enabled? }
export async function PUT(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader', 'field_coordinator'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  if (!TUNABLE.includes(body.event)) return NextResponse.json({ error: 'That event can’t be customised.' }, { status: 400 })

  const supabase = createServiceClient()
  if (body.scope === 'org') {
    if (session!.role !== 'org_admin') return NextResponse.json({ error: 'Only an org admin can set org defaults.' }, { status: 403 })
    const { error } = await supabase.from('org_notification_defaults').upsert({
      org_id: session!.orgId, event_type: body.event, enabled: !!body.enabled, push: !!body.push, sms: !!body.sms, email: !!body.email,
    }, { onConflict: 'org_id,event_type' })
    if (error) return NextResponse.json({ error: 'Could not save org default.' }, { status: 500 })
    return NextResponse.json({ success: true })
  }
  // user scope
  const { error } = await supabase.from('user_notification_prefs').upsert({
    ngo_user_id: session!.userId, org_id: session!.orgId, event_type: body.event, push: !!body.push, sms: !!body.sms, email: !!body.email,
  }, { onConflict: 'ngo_user_id,event_type' })
  if (error) return NextResponse.json({ error: 'Could not save preference.' }, { status: 500 })
  return NextResponse.json({ success: true })
}
