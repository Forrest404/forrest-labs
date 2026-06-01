import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hashSecret, isValidPin, type NgoRole } from '@/lib/ngo-auth'
import { consumeAuthToken } from '@/lib/ngo-tokens'

// POST /api/ngo/auth/invite/accept — PUBLIC (token-gated). The invitee sets their own
// name + credential. Consuming the token is single-use; a reused/expired token is
// rejected. Field coordinators set a 6-digit PIN; leaders/admins set a password.
export async function POST(request: NextRequest) {
  let body: { token?: string; full_name?: string; password?: string; pin?: string } = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const raw = String(body.token ?? '')
  const fullName = String(body.full_name ?? '').trim()
  if (!fullName) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })

  const supabase = createServiceClient()
  const token = await consumeAuthToken(supabase, 'invite', raw)
  if (!token || !token.email) {
    return NextResponse.json({ error: 'This invite link is invalid or has expired. Ask for a new one.' }, { status: 400 })
  }

  const role = (token.role ?? 'field_coordinator') as NgoRole
  const credential: Record<string, unknown> = {}
  if (role === 'field_coordinator') {
    const pin = String(body.pin ?? '')
    if (!isValidPin(pin)) return NextResponse.json({ error: 'Choose a 6-digit PIN.' }, { status: 400 })
    credential.pin_hash = hashSecret(pin)
  } else {
    const password = String(body.password ?? '')
    if (password.length < 8) return NextResponse.json({ error: 'Choose a password of at least 8 characters.' }, { status: 400 })
    credential.password_hash = hashSecret(password)
  }

  // Create the account, or re-activate an existing suspended/invited row for this email
  // in the SAME org (the invite is org-bound).
  const { data: existing } = await supabase
    .from('ngo_users').select('id').eq('email', token.email).eq('org_id', token.org_id).maybeSingle()

  let userId: string
  if (existing) {
    const { error } = await supabase
      .from('ngo_users')
      .update({ full_name: fullName, role, status: 'active', ...credential })
      .eq('id', existing.id).eq('org_id', token.org_id)
    if (error) return NextResponse.json({ error: 'Could not set up your account.' }, { status: 500 })
    userId = existing.id
  } else {
    const { data, error } = await supabase
      .from('ngo_users')
      .insert({ org_id: token.org_id, email: token.email, full_name: fullName, role, status: 'active', ...credential })
      .select('id').single()
    if (error || !data) {
      if ((error as any)?.code === '23505') return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 })
      return NextResponse.json({ error: 'Could not set up your account.' }, { status: 500 })
    }
    userId = data.id
  }

  // Best-effort: link to the invited team's roster (never fails the accept).
  if (token.team_id) {
    try {
      const { data: link } = await supabase
        .from('team_members').select('id').eq('team_id', token.team_id).eq('ngo_user_id', userId).maybeSingle()
      if (!link) await supabase.from('team_members').insert({ team_id: token.team_id, ngo_user_id: userId, name: fullName, role })
    } catch { /* roster link is a bonus */ }
  }

  return NextResponse.json({ success: true, role })
}
