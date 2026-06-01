import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole, verifySecret, hashSecret, isValidPin } from '@/lib/ngo-auth'

// Change your OWN password (leaders/admins) or PIN (field coordinators). Requires the
// current credential, then bumps token_version so other devices are signed out. Scoped
// to session.userId — never touches another user.
export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader', 'field_coordinator'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  let body: { current?: string; new_password?: string; new_pin?: string } = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const supabase = createServiceClient()
  const { data: user } = await supabase
    .from('ngo_users').select('password_hash, pin_hash, token_version').eq('id', session!.userId).maybeSingle()
  if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const current = String(body.current ?? '')
  const update: Record<string, unknown> = {}

  if (body.new_pin !== undefined) {
    // PIN change (field coordinators / anyone with a PIN). Verify current PIN if one is set.
    if (user.pin_hash && !verifySecret(current, user.pin_hash)) {
      return NextResponse.json({ error: 'Current PIN is incorrect.' }, { status: 400 })
    }
    if (!isValidPin(String(body.new_pin))) return NextResponse.json({ error: 'New PIN must be 6 digits.' }, { status: 400 })
    update.pin_hash = hashSecret(String(body.new_pin))
  } else {
    // Password change (leaders/admins). Verify the current password if one is set.
    if (user.password_hash && !verifySecret(current, user.password_hash)) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 })
    }
    const next = String(body.new_password ?? '')
    if (next.length < 8) return NextResponse.json({ error: 'New password must be at least 8 characters.' }, { status: 400 })
    update.password_hash = hashSecret(next)
  }

  // Sign out other devices on a credential change (tolerant of a missing column).
  if (typeof (user as any).token_version === 'number') update.token_version = (user as any).token_version + 1

  const { error } = await supabase.from('ngo_users').update(update).eq('id', session!.userId)
  if (error) return NextResponse.json({ error: 'Could not update your credential.' }, { status: 500 })
  return NextResponse.json({ success: true })
}
