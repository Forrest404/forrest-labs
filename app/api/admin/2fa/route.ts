import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { getAdminSecurity, verifyAdminSecondFactor } from '@/lib/admin/twofactor'
import { generateTotpSecret, totpKeyUri, verifyTotp } from '@/lib/totp'
import { generateRecoveryCodes } from '@/lib/ngo-tokens'
import { sendEmail, securityNoticeEmail } from '@/lib/email'

async function adminNotice(action: 'enabled' | 'reset') {
  const to = process.env.ADMIN_EMAIL
  if (!to) return // no admin email configured → on-screen only
  const tpl = securityNoticeEmail(action)
  await sendEmail({ to, ...tpl }).catch(() => {})
}

// GET — 2FA status for the admin security UI.
export async function GET(request: NextRequest) {
  const admin = await getSessionFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  const sec = await getAdminSecurity(createServiceClient())
  return NextResponse.json({ enabled: sec.totp_enabled, recovery_remaining: sec.recovery_hashes.length })
}

// POST — actions: setup (generate a pending secret + QR URI), enable (verify a code →
// turn on + return recovery codes once), disable (verify → turn off).
export async function POST(request: NextRequest) {
  const admin = await getSessionFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  let body: { action?: string; code?: string } = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const supabase = createServiceClient()

  if (body.action === 'setup') {
    const secret = generateTotpSecret()
    const { error } = await supabase.from('admin_security')
      .upsert({ id: 'singleton', totp_secret: secret, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) return NextResponse.json({ error: 'Could not start 2FA setup' }, { status: 500 })
    return NextResponse.json({ secret, uri: totpKeyUri('NOUR admin', secret) })
  }

  if (body.action === 'enable') {
    const sec = await getAdminSecurity(supabase)
    if (!sec.totp_secret) return NextResponse.json({ error: 'Start setup first' }, { status: 400 })
    if (!verifyTotp(String(body.code ?? ''), sec.totp_secret)) {
      return NextResponse.json({ error: 'That code didn’t match. Try again.' }, { status: 400 })
    }
    const { plain, hashes } = generateRecoveryCodes(8)
    const { error } = await supabase.from('admin_security')
      .update({ totp_enabled: true, recovery_hashes: hashes, updated_at: new Date().toISOString() }).eq('id', 'singleton')
    if (error) return NextResponse.json({ error: 'Could not enable 2FA' }, { status: 500 })
    await adminNotice('enabled')
    return NextResponse.json({ success: true, recovery_codes: plain })
  }

  if (body.action === 'disable') {
    const sec = await getAdminSecurity(supabase)
    if (!sec.totp_enabled) return NextResponse.json({ success: true })
    const ok = await verifyAdminSecondFactor(supabase, sec, String(body.code ?? ''))
    if (!ok) return NextResponse.json({ error: 'Enter a current code to disable 2FA.' }, { status: 400 })
    const { error } = await supabase.from('admin_security')
      .update({ totp_enabled: false, totp_secret: null, recovery_hashes: [], updated_at: new Date().toISOString() }).eq('id', 'singleton')
    if (error) return NextResponse.json({ error: 'Could not disable 2FA' }, { status: 500 })
    await adminNotice('reset')
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
