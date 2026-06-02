import 'server-only'
import { authenticator } from 'otplib'

// TOTP (RFC 6238) via otplib — the second factor for admin (enforced) and NGO (optional).
// Authenticator-app based: works offline, no SMS/email OTP. A small step window tolerates
// clock skew. Secrets are base32; the server stores them to verify codes.

// Allow the code from the previous/next 30s step (±1) for clock drift.
authenticator.options = { window: 1 }

export function generateTotpSecret(): string {
  return authenticator.generateSecret() // base32
}

// otpauth:// URI an authenticator app scans. `account` is shown to the user (e.g. email
// or "NOUR admin"); `issuer` groups it under NOUR.
export function totpKeyUri(account: string, secret: string, issuer = 'NOUR'): string {
  return authenticator.keyuri(account, issuer, secret)
}

export function verifyTotp(token: string, secret: string): boolean {
  const t = (token ?? '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(t) || !secret) return false
  try { return authenticator.verify({ token: t, secret }) } catch { return false }
}
