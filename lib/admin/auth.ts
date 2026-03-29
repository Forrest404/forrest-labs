import { SignJWT, jwtVerify } from 'jose'
import { createHash, randomBytes } from 'crypto'
import { NextRequest } from 'next/server'

const COOKIE_NAME = 'fl_admin_session'
const JWT_EXPIRY = '8h'

function getJwtSecret(): Uint8Array {
  const secret = process.env.ADMIN_JWT_SECRET
  if (!secret) throw new Error('ADMIN_JWT_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

export function verifyPassword(input: string): boolean {
  const stored = process.env.ADMIN_PASSWORD
  if (!stored) return false
  const inputHash = hashPassword(input)
  const storedHash = hashPassword(stored)
  return inputHash === storedHash
}

export async function createSession(sessionId: string): Promise<string> {
  const secret = getJwtSecret()
  return await new SignJWT({ sessionId, role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(secret)
}

export async function verifySession(
  token: string,
): Promise<{ sessionId: string } | null> {
  try {
    const secret = getJwtSecret()
    const { payload } = await jwtVerify(token, secret)
    return { sessionId: payload.sessionId as string }
  } catch {
    return null
  }
}

export async function getSessionFromRequest(
  request: NextRequest,
): Promise<{ sessionId: string } | null> {
  const token = request.cookies.get(COOKIE_NAME)
  if (!token?.value) return null
  return await verifySession(token.value)
}

export function setCookieOnResponse(response: Response, token: string): void {
  response.headers.set(
    'Set-Cookie',
    [
      `${COOKIE_NAME}=${token}`,
      'HttpOnly',
      'Secure',
      'SameSite=Strict',
      'Path=/',
      'Max-Age=28800',
    ].join('; '),
  )
}

export function clearCookieOnResponse(response: Response): void {
  response.headers.set(
    'Set-Cookie',
    [
      `${COOKIE_NAME}=`,
      'HttpOnly',
      'Secure',
      'SameSite=Strict',
      'Path=/',
      'Max-Age=0',
    ].join('; '),
  )
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME

// ── Partner auth ──────────────────────────────────────────────────────────────

export function hashPartnerPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

export function generatePartnerPassword(): string {
  return randomBytes(8)
    .toString('hex')
    .toUpperCase()
    .match(/.{4}/g)!
    .join('-')
}

export async function createPartnerSession(
  accountId: string,
  organisationId: string,
  role: string,
): Promise<string> {
  const secret = getJwtSecret()
  return await new SignJWT({ accountId, organisationId, role, type: 'partner' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret)
}

export async function getPartnerSession(
  request: NextRequest,
): Promise<{ accountId: string; organisationId: string; role: string } | null> {
  const token = request.cookies.get('fl_partner_session')?.value
  if (!token) return null
  try {
    const secret = getJwtSecret()
    const { payload } = await jwtVerify(token, secret)
    if (payload.type !== 'partner') return null
    return {
      accountId: payload.accountId as string,
      organisationId: payload.organisationId as string,
      role: payload.role as string,
    }
  } catch {
    return null
  }
}
