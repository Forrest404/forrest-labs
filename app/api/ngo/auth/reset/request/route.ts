import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createAuthToken } from '@/lib/ngo-tokens'
import { sendEmail, logEmail, emailRateOk, resetEmail } from '@/lib/email'

const RESET_TTL_MIN = 60 // 1 hour

// POST /api/ngo/auth/reset/request — PUBLIC. Sends a single-use reset link IF the email
// belongs to a password/PIN account. ALWAYS returns the same generic 200 — never reveals
// whether an account exists. Rate-limited per email to prevent enumeration/flooding.
export async function POST(request: NextRequest) {
  let body: { email?: string } = {}
  try { body = await request.json() } catch { /* fall through to generic */ }
  const email = String(body.email ?? '').trim().toLowerCase()

  const generic = NextResponse.json({ success: true, note: 'If that email has an account, a reset link is on its way.' })
  if (!email.includes('@')) return generic

  const supabase = createServiceClient()

  // Rate-limit regardless of whether the account exists (don't leak via timing of limits).
  if (!(await emailRateOk(supabase, 'password_reset', email, 3, 60))) {
    return generic // silently throttle; still no existence signal
  }

  // Only password/PIN accounts can reset (code-only field coords recover via an admin
  // code-regen). We never reveal which case applies.
  const { data: user } = await supabase
    .from('ngo_users')
    .select('id, org_id, status, password_hash, pin_hash')
    .eq('email', email).maybeSingle()

  if (user && user.status === 'active' && (user.password_hash || user.pin_hash)) {
    const token = await createAuthToken(supabase, 'password_reset', {
      org_id: user.org_id, ngo_user_id: user.id, email, ttlMinutes: RESET_TTL_MIN,
    })
    if (token) {
      const tpl = resetEmail(token.raw)
      const result = await sendEmail({ to: email, ...tpl })
      await logEmail(supabase, 'password_reset', email, user.org_id, result)
    }
  }

  return generic
}
