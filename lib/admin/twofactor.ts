import 'server-only'
import { verifyTotp } from '@/lib/totp'
import { hashRecoveryCode } from '@/lib/ngo-tokens'

// Admin 2FA state lives in the single-row admin_security table (admin is an env-based
// account, not an ngo_users row). These helpers read it and verify a second factor.

export interface AdminSecurity { totp_secret: string | null; totp_enabled: boolean; recovery_hashes: string[] }

export async function getAdminSecurity(supabase: any): Promise<AdminSecurity> {
  try {
    const { data } = await supabase.from('admin_security').select('totp_secret, totp_enabled, recovery_hashes').eq('id', 'singleton').maybeSingle()
    return {
      totp_secret: data?.totp_secret ?? null,
      totp_enabled: !!data?.totp_enabled,
      recovery_hashes: data?.recovery_hashes ?? [],
    }
  } catch {
    // Column/table absent (pre-migration) → treat as not-enabled so admin login still works.
    return { totp_secret: null, totp_enabled: false, recovery_hashes: [] }
  }
}

// Verify a TOTP code, or a one-time recovery code (consumed on success). Returns whether
// the second factor passed.
export async function verifyAdminSecondFactor(supabase: any, sec: AdminSecurity, code: string): Promise<boolean> {
  const c = (code ?? '').trim()
  if (!c) return false
  if (sec.totp_secret && verifyTotp(c, sec.totp_secret)) return true
  // Recovery code path: match a stored hash, then remove it (single-use).
  const h = hashRecoveryCode(c)
  if (sec.recovery_hashes.includes(h)) {
    const remaining = sec.recovery_hashes.filter((x) => x !== h)
    await supabase.from('admin_security').update({ recovery_hashes: remaining, updated_at: new Date().toISOString() }).eq('id', 'singleton')
    return true
  }
  return false
}
