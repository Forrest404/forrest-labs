import { SignJWT, jwtVerify } from 'jose'
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'
import { NextRequest } from 'next/server'

// ── NGO session auth ──────────────────────────────────────────────────────────
// Separate from admin/partner. Own cookie (fl_ngo_session), own module.
// Passwords + PINs use salted scrypt (stronger than the codebase's legacy sha256,
// because NGO signup is public/self-service). Node runtime only — do NOT import
// this from the Edge middleware (scrypt/crypto won't load there).

export const NGO_COOKIE_NAME = 'fl_ngo_session'
const COOKIE_MAX_AGE = 43200 // 12h default (admins/leaders)

export type NgoRole = 'org_admin' | 'team_leader' | 'field_coordinator'

// Field coordinators stay signed in for 30 days (they work offline, in the field);
// admins/leaders keep a 12h desktop session.
export function ngoSessionTtlSeconds(role: NgoRole): number {
  return role === 'field_coordinator' ? 60 * 60 * 24 * 30 : COOKIE_MAX_AGE
}

// A unique, easy-to-read bearer access code for field-operative login (typed or via
// a QR/link). Crockford-ish base32 minus ambiguous chars (no 0/O/1/I/L/U).
export function generateLoginCode(): string {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
  const bytes = randomBytes(8)
  let code = ''
  for (let i = 0; i < 8; i++) code += alphabet[bytes[i] % alphabet.length]
  return code
}

export interface NgoSession {
  userId: string
  orgId: string
  role: NgoRole
}

function getJwtSecret(): Uint8Array {
  // Shared with admin/partner (same signing key, distinct cookie + token type).
  const secret = process.env.ADMIN_JWT_SECRET
  if (!secret) throw new Error('ADMIN_JWT_SECRET is not set')
  return new TextEncoder().encode(secret)
}

// ── Password / PIN hashing (salted scrypt) ────────────────────────────────────

export function hashSecret(plain: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(plain, salt, 64)
  return `${salt.toString('hex')}:${derived.toString('hex')}`
}

export function verifySecret(plain: string, stored: string | null | undefined): boolean {
  if (!stored) return false
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  try {
    const salt = Buffer.from(saltHex, 'hex')
    const expected = Buffer.from(hashHex, 'hex')
    const derived = scryptSync(plain, salt, expected.length)
    return expected.length === derived.length && timingSafeEqual(expected, derived)
  } catch {
    return false
  }
}

// ── JWT session ───────────────────────────────────────────────────────────────

export async function createNgoSession(userId: string, orgId: string, role: NgoRole): Promise<string> {
  const secret = getJwtSecret()
  const exp = Math.floor(Date.now() / 1000) + ngoSessionTtlSeconds(role)
  return await new SignJWT({ userId, orgId, role, type: 'ngo' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret)
}

export async function verifyNgoToken(token: string): Promise<NgoSession | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret())
    if (payload.type !== 'ngo') return null
    return {
      userId: payload.userId as string,
      orgId: payload.orgId as string,
      role: payload.role as NgoRole,
    }
  } catch {
    return null
  }
}

export async function getNgoSession(request: NextRequest): Promise<NgoSession | null> {
  const token = request.cookies.get(NGO_COOKIE_NAME)?.value
  if (!token) return null
  const session = await verifyNgoToken(token)
  if (!session) return null

  // Revocation check: a valid JWT is not enough — the user must still be active and
  // their org still approved. "Revoke access" thus logs a signed-in NGO out mid-session.
  //
  // BUT we must NOT sign a field worker out on a transient DB blip (a refresh fires a
  // burst of /api/ngo/* calls; one failed query used to 401 and bounce them to login).
  // So we FAIL-OPEN on query errors (trust the time-bounded JWT) and only FAIL-CLOSED on
  // a *definitive* answer: the user is gone/suspended, or the org isn't approved. Two
  // plain queries (no fragile !inner embed). Node-only; never imported by Edge middleware.
  try {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const supabase = createServiceClient()

    const { data: user, error: userErr } = await supabase
      .from('ngo_users').select('status, org_id').eq('id', session.userId).maybeSingle()
    if (userErr) return session            // transient — keep them signed in
    if (!user) return null                 // user deleted — genuinely revoked
    if (user.status !== 'active') return null // suspended — revoked

    const { data: org, error: orgErr } = await supabase
      .from('ngo_organisations').select('status').eq('id', user.org_id).maybeSingle()
    if (orgErr) return session             // transient — keep them signed in
    if (org && org.status !== 'approved') return null // org suspended/pending — revoked

    return session
  } catch {
    // Network/runtime error reaching the DB — trust the valid JWT rather than bounce.
    return session
  }
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

export function setNgoCookie(response: Response, token: string, maxAgeSeconds: number = COOKIE_MAX_AGE): void {
  response.headers.set(
    'Set-Cookie',
    [
      `${NGO_COOKIE_NAME}=${token}`,
      'HttpOnly',
      'Secure',
      // Lax (not Strict): the session must survive top-level loads reached via an
      // external link — field staff open the QR/login link from Signal/WhatsApp, and
      // some mobile in-app browsers withhold Strict cookies on those navigations and
      // even on reloads, logging the worker out. State changes are POSTs, which Lax
      // still does not send cross-site, so CSRF protection is preserved.
      'SameSite=Lax',
      'Path=/',
      `Max-Age=${maxAgeSeconds}`,
    ].join('; '),
  )
}

export function clearNgoCookie(response: Response): void {
  response.headers.set(
    'Set-Cookie',
    [`${NGO_COOKIE_NAME}=`, 'HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=0'].join('; '),
  )
}

// ── Role enforcement ──────────────────────────────────────────────────────────

export function requireRole(session: NgoSession | null, allowed: NgoRole[]): boolean {
  return !!session && allowed.includes(session.role)
}

// ── Credential policy ─────────────────────────────────────────────────────────
// Field PINs must be 6 digits (security H1). A 4-digit PIN is only 10k combinations;
// 6 digits is 1,000,000 and, combined with login rate-limiting, makes online guessing
// infeasible. Existing shorter PINs still VERIFY (we never break a signed-in worker) —
// this floor applies only when a PIN is set or reset.
export const PIN_LENGTH = 6
export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)
}
