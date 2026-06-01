import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { verifySecret, createNgoSession, setNgoCookie, ngoSessionTtlSeconds, type NgoRole } from '@/lib/ngo-auth'
import { getNgoUserSecurity, verifyNgoSecondFactor } from '@/lib/ngo-twofactor'
import { rateLimit, clientIp, tooMany, AUTH_MAX, AUTH_WINDOW } from '@/lib/rate-limit'

// Three ways in:
//  - Field operative: { code }            → single bearer access code (typed or via QR)
//  - Desktop:         { email, password }  → org admins / team leaders
//  - Legacy fallback: { email, pin }       → pre-access-code field coordinators

// Brute-force throttle (security H1): DURABLE rate limit (5 attempts / 15 min), keyed by
// client IP — and, on the email path, additionally by account so a distributed attack on
// one worker's credentials is also capped. IP-based so an attacker can't lock a worker out
// of their own account; durable so it survives cold starts and spans Vercel instances.

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const ip = clientIp(request)
  const ipLimit = await rateLimit(supabase, { bucket: 'auth:ngo-login', identifier: ip, max: AUTH_MAX, windowSec: AUTH_WINDOW })
  if (!ipLimit.ok) return tooMany(ipLimit.retryAfter, 'Too many attempts. Try again in a few minutes.')

  let body: { code?: string; email?: string; password?: string; pin?: string; totp?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const code = body.code ? String(body.code).trim().toUpperCase() : ''
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = body.password ? String(body.password) : ''
  const pin = body.pin ? String(body.pin) : ''

  // Per-account cap on the email path (in addition to the IP cap above).
  if (email) {
    const acctLimit = await rateLimit(supabase, { bucket: 'auth:ngo-login:acct', identifier: email, max: AUTH_MAX, windowSec: AUTH_WINDOW })
    if (!acctLimit.ok) return tooMany(acctLimit.retryAfter, 'Too many attempts. Try again in a few minutes.')
  }

  const invalid = () => NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })

  // Resolve the user + verify the credential.
  let user: { id: string; org_id: string; role: string; status: string } | null = null

  if (code) {
    const { data } = await supabase
      .from('ngo_users')
      .select('id, org_id, role, status')
      .eq('login_code', code)
      .maybeSingle()
    // Access codes are for field coordinators only.
    if (!data || data.role !== 'field_coordinator') return invalid()
    user = data
  } else if (email && (password || pin)) {
    const { data } = await supabase
      .from('ngo_users')
      .select('id, org_id, role, status, password_hash, pin_hash')
      .eq('email', email)
      .maybeSingle()
    if (!data) return invalid()
    const credentialOk = pin
      ? verifySecret(pin, data.pin_hash as string | null)
      : verifySecret(password, data.password_hash as string | null)
    if (!credentialOk) return invalid()
    user = { id: data.id, org_id: data.org_id, role: data.role, status: data.status }
  } else {
    return NextResponse.json({ error: 'Enter your access code, or email and password' }, { status: 400 })
  }

  if (user.status !== 'active') {
    return NextResponse.json({ error: 'This account has been suspended' }, { status: 403 })
  }

  // Credential is valid — only now reveal org approval status.
  const { data: org } = await supabase.from('ngo_organisations').select('status').eq('id', user.org_id).single()
  if (!org || org.status !== 'approved') {
    const msg =
      org?.status === 'suspended'
        ? 'Your organisation has been suspended. Contact NOUR.'
        : 'Your organisation is pending approval. You will be notified once approved.'
    return NextResponse.json({ error: msg, status: org?.status ?? 'pending' }, { status: 403 })
  }

  // Second factor (password accounts that opted into TOTP). Field-coordinator access-code
  // logins are exempt (the code is their factor). Missing → tell the client to prompt.
  if (!code) {
    const sec = await getNgoUserSecurity(supabase, user.id)
    if (sec.totp_enabled) {
      const totp = body.totp ? String(body.totp) : ''
      if (!totp) return NextResponse.json({ error: 'Authentication code required', totp_required: true }, { status: 401 })
      const ok = await verifyNgoSecondFactor(supabase, user.id, sec, totp)
      if (!ok) return NextResponse.json({ error: 'Invalid authentication code', totp_required: true }, { status: 401 })
    }
  }

  // Embed the user's current revocation epoch so a later admin "sign out all devices"
  // invalidates this token. Tolerant of a not-yet-applied column (defaults to 1).
  let tokenVersion = 1
  const { data: tv } = await supabase.from('ngo_users').select('token_version').eq('id', user.id).maybeSingle()
  if (tv && typeof (tv as any).token_version === 'number') tokenVersion = (tv as any).token_version

  const role = user.role as NgoRole
  const token = await createNgoSession(user.id, user.org_id, role, tokenVersion)
  const response = NextResponse.json({ success: true, role })
  setNgoCookie(response as unknown as Response, token, ngoSessionTtlSeconds(role))
  return response
}
