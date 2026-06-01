import 'server-only'
import { randomBytes, createHash } from 'crypto'

// Single-use, time-limited, cryptographically-random tokens for invite / password-reset /
// 2FA-recovery links. The RAW token is returned ONCE (to build the email link) and is
// never stored; only its sha256 hash is persisted, so a DB read cannot reconstruct a live
// link. Consuming is atomic (update ... where unused and unexpired returning *), giving
// true single-use + expiry. Node-only; never import from the Edge middleware.

export type TokenKind = 'invite' | 'password_reset' | 'recovery'

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export interface NewToken { raw: string; id: string }

// Create a token row and return the raw value for the link. ttlMinutes bounds its life.
export async function createAuthToken(
  supabase: any,
  kind: TokenKind,
  fields: { org_id: string; ngo_user_id?: string | null; email?: string | null; role?: string | null; team_id?: string | null; created_by?: string | null; ttlMinutes: number },
): Promise<NewToken | null> {
  const raw = randomBytes(32).toString('base64url') // 256-bit, URL-safe
  const expires = new Date(Date.now() + fields.ttlMinutes * 60000).toISOString()
  const { data, error } = await supabase
    .from('ngo_auth_tokens')
    .insert({
      kind,
      token_hash: hashToken(raw),
      ngo_user_id: fields.ngo_user_id ?? null,
      org_id: fields.org_id,
      email: fields.email ?? null,
      role: fields.role ?? null,
      team_id: fields.team_id ?? null,
      created_by: fields.created_by ?? null,
      expires_at: expires,
    })
    .select('id')
    .single()
  if (error || !data) return null
  return { raw, id: data.id }
}

export interface ConsumedToken {
  id: string; kind: string; ngo_user_id: string | null; org_id: string
  email: string | null; role: string | null; team_id: string | null
}

// Atomically consume a token: marks used_at only if it's the right kind, unused, and
// unexpired — so a reused or expired token returns null. Returns the row's bound fields.
export async function consumeAuthToken(supabase: any, kind: TokenKind, raw: string): Promise<ConsumedToken | null> {
  if (!raw || raw.length < 20) return null
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('ngo_auth_tokens')
    .update({ used_at: now })
    .eq('token_hash', hashToken(raw))
    .eq('kind', kind)
    .is('used_at', null)
    .gt('expires_at', now)
    .select('id, kind, ngo_user_id, org_id, email, role, team_id')
    .maybeSingle()
  if (error || !data) return null
  return data as ConsumedToken
}

// Recovery codes (2FA): generate N human-typeable single-use codes; store ONLY hashes.
// Returned plaintext is shown to the user once at enrolment, never persisted in clear.
export function generateRecoveryCodes(n = 8): { plain: string[]; hashes: string[] } {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
  const plain: string[] = []
  for (let i = 0; i < n; i++) {
    const b = randomBytes(10)
    let c = ''
    for (let j = 0; j < 10; j++) c += alphabet[b[j] % alphabet.length]
    plain.push(`${c.slice(0, 5)}-${c.slice(5)}`) // e.g. AB3CD-EF9GH
  }
  return { plain, hashes: plain.map((p) => hashToken(p.replace(/-/g, '').toUpperCase())) }
}

export function hashRecoveryCode(input: string): string {
  return hashToken(input.replace(/[^0-9A-Za-z]/g, '').toUpperCase())
}
