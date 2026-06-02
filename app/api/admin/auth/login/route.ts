import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { verifyPassword, createSession, setCookieOnResponse } from '@/lib/admin/auth'
import { writeAuditLog } from '@/lib/admin/audit'
import { createServiceClient } from '@/lib/supabase/service'
import { getAdminSecurity, verifyAdminSecondFactor } from '@/lib/admin/twofactor'
import { rateLimit, clientIp, tooMany, AUTH_MAX, AUTH_WINDOW } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  const ipKey = clientIp(request)
  const supabase = createServiceClient()

  // Durable brute-force throttle: 5 attempts / 15 min by IP (survives cold starts).
  const limit = await rateLimit(supabase, { bucket: 'auth:admin-login', identifier: ipKey, max: AUTH_MAX, windowSec: AUTH_WINDOW })
  if (!limit.ok) return tooMany(limit.retryAfter, 'Too many attempts. Try again in 15 minutes.')

  let body: { password?: string; code?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { password, code } = body

  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Password required' }, { status: 400 })
  }

  const isValid = verifyPassword(password)

  if (!isValid) {
    await writeAuditLog({
      action: 'admin_login_failed',
      entityType: 'auth',
      sessionId: 'none',
      ipAddress: ipKey,
      notes: 'Invalid password attempt',
    })

    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  // Second factor (if admin TOTP is enabled). Password was correct; now require a valid
  // authenticator code or a one-time recovery code. Missing → tell the client to prompt.
  const sec = await getAdminSecurity(supabase)
  if (sec.totp_enabled) {
    if (!code) {
      return NextResponse.json({ error: 'Authentication code required', totp_required: true }, { status: 401 })
    }
    const ok = await verifyAdminSecondFactor(supabase, sec, String(code))
    if (!ok) {
      await writeAuditLog({ action: 'admin_login_failed', entityType: 'auth', sessionId: 'none', ipAddress: ipKey, notes: 'Invalid 2FA code' })
      return NextResponse.json({ error: 'Invalid authentication code', totp_required: true }, { status: 401 })
    }
  }

  const sessionId = randomUUID()
  const token = await createSession(sessionId)

  await writeAuditLog({
    action: 'admin_login',
    entityType: 'auth',
    sessionId,
    ipAddress: ipKey,
    notes: 'Successful admin login',
  })

  const response = NextResponse.json({ success: true })
  setCookieOnResponse(response as unknown as Response, token)
  return response
}
