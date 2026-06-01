import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { verifyPassword, createSession, setCookieOnResponse } from '@/lib/admin/auth'
import { writeAuditLog } from '@/lib/admin/audit'
import { createServiceClient } from '@/lib/supabase/service'
import { getAdminSecurity, verifyAdminSecondFactor } from '@/lib/admin/twofactor'

const rateLimitStore = new Map<string, { attempts: number; lockedUntil: number }>()

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown'
  const ipKey = ip.split(',')[0].trim()
  const now = Date.now()
  const existing = rateLimitStore.get(ipKey)

  if (existing) {
    if (existing.lockedUntil > now) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again in 15 minutes.' },
        { status: 429 },
      )
    }
    if (existing.attempts >= 5) {
      rateLimitStore.set(ipKey, {
        attempts: existing.attempts,
        lockedUntil: now + 15 * 60 * 1000,
      })
      return NextResponse.json(
        { error: 'Too many attempts. Locked for 15 minutes.' },
        { status: 429 },
      )
    }
  }

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
    const prev = rateLimitStore.get(ipKey)
    rateLimitStore.set(ipKey, {
      attempts: (prev?.attempts ?? 0) + 1,
      lockedUntil: prev?.lockedUntil ?? 0,
    })

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
  const supabase = createServiceClient()
  const sec = await getAdminSecurity(supabase)
  if (sec.totp_enabled) {
    if (!code) {
      return NextResponse.json({ error: 'Authentication code required', totp_required: true }, { status: 401 })
    }
    const ok = await verifyAdminSecondFactor(supabase, sec, String(code))
    if (!ok) {
      const prev = rateLimitStore.get(ipKey)
      rateLimitStore.set(ipKey, { attempts: (prev?.attempts ?? 0) + 1, lockedUntil: prev?.lockedUntil ?? 0 })
      await writeAuditLog({ action: 'admin_login_failed', entityType: 'auth', sessionId: 'none', ipAddress: ipKey, notes: 'Invalid 2FA code' })
      return NextResponse.json({ error: 'Invalid authentication code', totp_required: true }, { status: 401 })
    }
  }

  rateLimitStore.delete(ipKey)

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
