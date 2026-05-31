import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole, hashSecret, generateLoginCode, type NgoRole } from '@/lib/ngo-auth'

const ROLES: NgoRole[] = ['org_admin', 'team_leader', 'field_coordinator']

// Org-admin user management for the caller's own organisation.
export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('ngo_users')
    .select('id, full_name, email, phone, role, status, created_at, login_code')
    .eq('org_id', session!.orgId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: 'Could not load users' }, { status: 500 })
  // Mark whether each row has a usable credential, and who the caller is.
  return NextResponse.json({ users: data ?? [], me: session!.userId })
}

export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  let body: { full_name?: string; email?: string; phone?: string; role?: string; password?: string; pin?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const fullName = String(body.full_name ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const role = String(body.role ?? '') as NgoRole
  if (!fullName) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!email.includes('@')) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  if (!ROLES.includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })

  // Credential by role: field coordinators get an auto-generated access code
  // (sign in by typing it or scanning a QR/link); leaders/admins a password.
  const insert: Record<string, unknown> = {
    org_id: session!.orgId, full_name: fullName, email,
    phone: body.phone ? String(body.phone).trim() : null, role, status: 'active',
  }
  let loginCode: string | null = null
  if (role === 'field_coordinator') {
    loginCode = generateLoginCode()
    insert.login_code = loginCode
  } else {
    const password = String(body.password ?? '')
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    insert.password_hash = hashSecret(password)
  }

  const supabase = createServiceClient()
  // Retry once on the rare login_code collision.
  let data: { id: string } | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await supabase.from('ngo_users').insert(insert).select('id').single()
    if (!res.error) { data = res.data; break }
    if ((res.error as any)?.code === '23505') {
      // Email collision is a real error; a code collision we retry with a new code.
      const { data: byEmail } = await supabase.from('ngo_users').select('id').eq('email', email).maybeSingle()
      if (byEmail) return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
      if (loginCode) { loginCode = generateLoginCode(); insert.login_code = loginCode; continue }
    }
    return NextResponse.json({ error: 'Could not create user' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Could not create user' }, { status: 500 })
  return NextResponse.json({ success: true, id: data.id, login_code: loginCode })
}
