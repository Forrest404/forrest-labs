import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hashSecret, isValidPin } from '@/lib/ngo-auth'
import { consumeAuthToken } from '@/lib/ngo-tokens'

// POST /api/ngo/auth/reset/confirm — PUBLIC (token-gated). Sets a new password OR PIN and
// bumps token_version so any other live session for this user is invalidated. Single-use:
// a reused/expired token is rejected.
export async function POST(request: NextRequest) {
  let body: { token?: string; password?: string; pin?: string } = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const raw = String(body.token ?? '')
  const supabase = createServiceClient()
  const token = await consumeAuthToken(supabase, 'password_reset', raw)
  if (!token || !token.ngo_user_id) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired. Request a new one.' }, { status: 400 })
  }

  const credential: Record<string, unknown> = {}
  const pin = String(body.pin ?? '')
  const password = String(body.password ?? '')
  if (pin) {
    if (!isValidPin(pin)) return NextResponse.json({ error: 'PIN must be 6 digits.' }, { status: 400 })
    credential.pin_hash = hashSecret(pin)
  } else {
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    credential.password_hash = hashSecret(password)
  }

  // Bump token_version to sign out other devices (tolerant if the column is absent).
  try {
    const { data: cur } = await supabase.from('ngo_users').select('token_version').eq('id', token.ngo_user_id).maybeSingle()
    if (cur && typeof (cur as any).token_version === 'number') credential.token_version = (cur as any).token_version + 1
  } catch { /* token_version optional */ }

  const { error } = await supabase
    .from('ngo_users').update(credential).eq('id', token.ngo_user_id).eq('org_id', token.org_id)
  if (error) return NextResponse.json({ error: 'Could not reset your password.' }, { status: 500 })

  return NextResponse.json({ success: true })
}
