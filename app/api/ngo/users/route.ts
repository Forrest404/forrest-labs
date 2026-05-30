import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole, hashSecret, type NgoRole } from '@/lib/ngo-auth'

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
    .select('id, full_name, email, phone, role, status, created_at')
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

  // Credential by role: field coordinators get a PIN; leaders/admins a password.
  const insert: Record<string, unknown> = {
    org_id: session!.orgId, full_name: fullName, email,
    phone: body.phone ? String(body.phone).trim() : null, role, status: 'active',
  }
  if (role === 'field_coordinator') {
    const pin = String(body.pin ?? '').trim()
    if (!/^\d{4,6}$/.test(pin)) return NextResponse.json({ error: 'PIN must be 4–6 digits' }, { status: 400 })
    insert.pin_hash = hashSecret(pin)
  } else {
    const password = String(body.password ?? '')
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    insert.password_hash = hashSecret(password)
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('ngo_users').insert(insert).select('id').single()
  if (error || !data) {
    if ((error as any)?.code === '23505') return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    return NextResponse.json({ error: 'Could not create user' }, { status: 500 })
  }
  return NextResponse.json({ success: true, id: data.id })
}
