import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { verifySecret, createNgoSession, setNgoCookie, ngoSessionTtlSeconds, type NgoRole } from '@/lib/ngo-auth'

// Three ways in:
//  - Field operative: { code }            → single bearer access code (typed or via QR)
//  - Desktop:         { email, password }  → org admins / team leaders
//  - Legacy fallback: { email, pin }       → pre-access-code field coordinators
export async function POST(request: NextRequest) {
  let body: { code?: string; email?: string; password?: string; pin?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const code = body.code ? String(body.code).trim().toUpperCase() : ''
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = body.password ? String(body.password) : ''
  const pin = body.pin ? String(body.pin) : ''

  const supabase = createServiceClient()
  const invalid = () => NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })

  // Resolve the user + verify the credential.
  let user: { id: string; org_id: string; role: string; status: string } | null = null

  if (code) {
    const { data } = await supabase
      .from('ngo_users')
      .select('id, org_id, role, status')
      .eq('login_code', code)
      .maybeSingle()
    // Access codes are for field coordinators only.
    if (!data || data.role !== 'field_coordinator') return invalid()
    user = data
  } else if (email && (password || pin)) {
    const { data } = await supabase
      .from('ngo_users')
      .select('id, org_id, role, status, password_hash, pin_hash')
      .eq('email', email)
      .maybeSingle()
    if (!data) return invalid()
    const credentialOk = pin
      ? verifySecret(pin, data.pin_hash as string | null)
      : verifySecret(password, data.password_hash as string | null)
    if (!credentialOk) return invalid()
    user = { id: data.id, org_id: data.org_id, role: data.role, status: data.status }
  } else {
    return NextResponse.json({ error: 'Enter your access code, or email and password' }, { status: 400 })
  }

  if (user.status !== 'active') {
    return NextResponse.json({ error: 'This account has been suspended' }, { status: 403 })
  }

  // Credential is valid — only now reveal org approval status.
  const { data: org } = await supabase.from('ngo_organisations').select('status').eq('id', user.org_id).single()
  if (!org || org.status !== 'approved') {
    const msg =
      org?.status === 'suspended'
        ? 'Your organisation has been suspended. Contact NOUR.'
        : 'Your organisation is pending approval. You will be notified once approved.'
    return NextResponse.json({ error: msg, status: org?.status ?? 'pending' }, { status: 403 })
  }

  const role = user.role as NgoRole
  const token = await createNgoSession(user.id, user.org_id, role)
  const response = NextResponse.json({ success: true, role })
  setNgoCookie(response as unknown as Response, token, ngoSessionTtlSeconds(role))
  return response
}
