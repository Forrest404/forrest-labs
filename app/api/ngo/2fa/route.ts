import { NextRequest, NextResponse } from 'next/server'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoUserSecurity, verifyNgoSecondFactor } from '@/lib/ngo-twofactor'
import { generateTotpSecret, totpKeyUri, verifyTotp } from '@/lib/totp'
import { rateLimit, tooMany, AUTH_MAX, AUTH_WINDOW } from '@/lib/rate-limit'
import { generateRecoveryCodes } from '@/lib/ngo-tokens'
import { sendEmail, logEmail, securityNoticeEmail } from '@/lib/email'

// Per-user 2FA for password accounts (org_admin / team_leader). Optional but recommended.
// Field coordinators sign in with a code and are excluded.

export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const sec = await getNgoUserSecurity(createServiceClient(), session!.userId)
  return NextResponse.json({ enabled: sec.totp_enabled, recovery_remaining: sec.recovery_hashes.length })
}

export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const userId = session!.userId
  const supabase = createServiceClient()

  // Cap 2FA code-verification attempts: 5 / 15 min per user.
  const limit = await rateLimit(supabase, { bucket: 'auth:ngo-2fa', identifier: userId, max: AUTH_MAX, windowSec: AUTH_WINDOW })
  if (!limit.ok) return tooMany(limit.retryAfter)

  let body: { action?: string; code?: string } = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  if (body.action === 'setup') {
    const secret = generateTotpSecret()
    const { error } = await supabase.from('ngo_users').update({ totp_secret: secret }).eq('id', userId).eq('org_id', session!.orgId)
    if (error) return NextResponse.json({ error: 'Could not start 2FA setup' }, { status: 500 })
    // Label the authenticator entry with the user's email if we have it.
    const { data: u } = await supabase.from('ngo_users').select('email').eq('id', userId).maybeSingle()
    return NextResponse.json({ secret, uri: totpKeyUri(u?.email ?? 'NOUR user', secret) })
  }

  if (body.action === 'enable') {
    const sec = await getNgoUserSecurity(supabase, userId)
    if (!sec.totp_secret) return NextResponse.json({ error: 'Start setup first' }, { status: 400 })
    if (!verifyTotp(String(body.code ?? ''), sec.totp_secret)) return NextResponse.json({ error: 'That code didn’t match. Try again.' }, { status: 400 })
    const { plain, hashes } = generateRecoveryCodes(8)
    const { error } = await supabase.from('ngo_users').update({ totp_enabled: true, recovery_hashes: hashes }).eq('id', userId).eq('org_id', session!.orgId)
    if (error) return NextResponse.json({ error: 'Could not enable 2FA' }, { status: 500 })
    const { data: u } = await supabase.from('ngo_users').select('email').eq('id', userId).maybeSingle()
    if (u?.email) { const tpl = securityNoticeEmail('enabled'); const r = await sendEmail({ to: u.email, ...tpl }); await logEmail(supabase, 'security_notice', u.email, session!.orgId, r) }
    return NextResponse.json({ success: true, recovery_codes: plain })
  }

  if (body.action === 'disable') {
    const sec = await getNgoUserSecurity(supabase, userId)
    if (!sec.totp_enabled) return NextResponse.json({ success: true })
    const ok = await verifyNgoSecondFactor(supabase, userId, sec, String(body.code ?? ''))
    if (!ok) return NextResponse.json({ error: 'Enter a current code to disable 2FA.' }, { status: 400 })
    const { error } = await supabase.from('ngo_users').update({ totp_enabled: false, totp_secret: null, recovery_hashes: [] }).eq('id', userId).eq('org_id', session!.orgId)
    if (error) return NextResponse.json({ error: 'Could not disable 2FA' }, { status: 500 })
    const { data: u } = await supabase.from('ngo_users').select('email').eq('id', userId).maybeSingle()
    if (u?.email) { const tpl = securityNoticeEmail('reset'); const r = await sendEmail({ to: u.email, ...tpl }); await logEmail(supabase, 'security_notice', u.email, session!.orgId, r) }
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
