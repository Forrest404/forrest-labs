import { SignJWT, jwtVerify } from 'jose'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
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
  // Timing-safe comparison (security M5). Both sides are fixed-length sha256 hex, so
  // a constant-time compare avoids leaking how many leading characters matched.
  const inputHash = Buffer.from(hashPassword(input), 'hex')
  const storedHash = Buffer.from(hashPassword(stored), 'hex')
  return inputHash.length === storedHash.length && timingSafeEqual(inputHash, storedHash)
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

// Legacy partner hash (unsalted sha256). Retained ONLY so verifyPartnerPassword can
// recognise and migrate pre-existing hashes. Do NOT use for new passwords.
export function hashPartnerPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

// Salted scrypt for partner passwords (security H4). Format: "saltHex:hashHex" — the
// presence of the ':' separator distinguishes a scrypt hash from a legacy 64-char
// sha256 hex, so verifyPartnerPassword can tell them apart and migrate on login.
export function hashPartnerPasswordScrypt(password: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${derived.toString('hex')}`
}

// Verify a partner password against either a new scrypt hash or a legacy sha256 hash.
// Returns needsRehash=true when the stored hash is legacy, so the caller can transparently
// upgrade it to scrypt on a successful login.
export function verifyPartnerPassword(
  password: string,
  stored: string | null | undefined,
): { ok: boolean; needsRehash: boolean } {
  if (!stored) return { ok: false, needsRehash: false }
  if (stored.includes(':')) {
    // scrypt path
    const [saltHex, hashHex] = stored.split(':')
    if (!saltHex || !hashHex) return { ok: false, needsRehash: false }
    try {
      const expected = Buffer.from(hashHex, 'hex')
      const derived = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
      const ok = expected.length === derived.length && timingSafeEqual(expected, derived)
      return { ok, needsRehash: false }
    } catch {
      return { ok: false, needsRehash: false }
    }
  }
  // legacy unsalted sha256 path — timing-safe compare, flag for migration on success.
  const input = Buffer.from(hashPartnerPassword(password), 'hex')
  const legacy = Buffer.from(stored, 'hex')
  const ok = input.length === legacy.length && legacy.length > 0 && timingSafeEqual(input, legacy)
  return { ok, needsRehash: ok }
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
