import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { verifyPassword, createSession, setCookieOnResponse } from '@/lib/admin/auth'
import { writeAuditLog } from '@/lib/admin/audit'

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

  let body: { password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { password } = body

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
