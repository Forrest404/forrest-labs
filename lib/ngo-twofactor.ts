import 'server-only'
import { verifyTotp } from '@/lib/totp'
import { hashRecoveryCode } from '@/lib/ngo-tokens'

// Per-NGO-user 2FA (TOTP) state on ngo_users. Optional (recommended) for password
// accounts (org_admin/team_leader). Field coordinators sign in with a code, not 2FA.

export interface NgoUserSecurity { totp_secret: string | null; totp_enabled: boolean; recovery_hashes: string[] }

export async function getNgoUserSecurity(supabase: any, userId: string): Promise<NgoUserSecurity> {
  try {
    const { data } = await supabase.from('ngo_users').select('totp_secret, totp_enabled, recovery_hashes').eq('id', userId).maybeSingle()
    return { totp_secret: data?.totp_secret ?? null, totp_enabled: !!data?.totp_enabled, recovery_hashes: data?.recovery_hashes ?? [] }
  } catch {
    return { totp_secret: null, totp_enabled: false, recovery_hashes: [] } // pre-migration → off
  }
}

// Verify a TOTP code or a one-time recovery code (consumed on success) for a user.
export async function verifyNgoSecondFactor(supabase: any, userId: string, sec: NgoUserSecurity, code: string): Promise<boolean> {
  const c = (code ?? '').trim()
  if (!c) return false
  if (sec.totp_secret && verifyTotp(c, sec.totp_secret)) return true
  const h = hashRecoveryCode(c)
  if (sec.recovery_hashes.includes(h)) {
    const remaining = sec.recovery_hashes.filter((x) => x !== h)
    await supabase.from('ngo_users').update({ recovery_hashes: remaining }).eq('id', userId)
    return true
  }
  return false
}
