import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole, generateLoginCode } from '@/lib/ngo-auth'

// Invite a roster member as a field_coordinator: create their ngo_users row with a
// unique access code (sign in by typing it or scanning a QR/link) and link it back
// to the team_members row. Only org_admin may invite. Scoped to the caller's org.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id, memberId } = await params

  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const email = String(body.email ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const loginCode = generateLoginCode()

  // Member must exist, belong to this team, and the team must belong to the org.
  const { data: member } = await supabase
    .from('team_members')
    .select('id, name, phone, ngo_user_id, ngo_teams!inner ( org_id )')
    .eq('id', memberId)
    .eq('team_id', id)
    .maybeSingle()

  const memberOrgId = (member as any)?.ngo_teams?.org_id
  if (!member || memberOrgId !== session!.orgId) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }
  if (member.ngo_user_id) {
    return NextResponse.json({ error: 'This member already has app access' }, { status: 409 })
  }

  // Create the field coordinator login.
  const { data: user, error: userErr } = await supabase
    .from('ngo_users')
    .insert({
      org_id: session!.orgId,
      email,
      role: 'field_coordinator',
      status: 'active',
      login_code: loginCode,
      full_name: member.name,
      phone: member.phone ?? null,
    })
    .select('id')
    .single()

  if (userErr || !user) {
    // 23505 = unique_violation (email or login_code).
    const { data: byEmail } = await supabase.from('ngo_users').select('id').eq('email', email).maybeSingle()
    if (byEmail) return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    return NextResponse.json({ error: 'Could not create field coordinator' }, { status: 500 })
  }

  // Link the new user to the roster member.
  await supabase.from('team_members').update({ ngo_user_id: user.id }).eq('id', member.id)

  return NextResponse.json({ success: true, login_code: loginCode })
}
