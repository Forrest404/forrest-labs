import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { verifySecret, createNgoSession, setNgoCookie, type NgoRole } from '@/lib/ngo-auth'

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string; pin?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const email = String(body.email ?? '').trim().toLowerCase()
  const password = body.password ? String(body.password) : ''
  const pin = body.pin ? String(body.pin) : ''

  if (!email || (!password && !pin)) {
    return NextResponse.json({ error: 'Email and password (or PIN) required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: user } = await supabase
    .from('ngo_users')
    .select('id, org_id, role, status, password_hash, pin_hash')
    .eq('email', email)
    .maybeSingle()

  // Same generic message whether the user is missing or the credential is wrong.
  const invalid = () => NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })

  if (!user) return invalid()
  if (user.status !== 'active') {
    return NextResponse.json({ error: 'This account has been suspended' }, { status: 403 })
  }

  const credentialOk = pin
    ? verifySecret(pin, user.pin_hash as string | null)
    : verifySecret(password, user.password_hash as string | null)
  if (!credentialOk) return invalid()

  // Credential is valid — only now reveal org approval status.
  const { data: org } = await supabase
    .from('ngo_organisations')
    .select('status')
    .eq('id', user.org_id as string)
    .single()

  if (!org || org.status !== 'approved') {
    const msg =
      org?.status === 'suspended'
        ? 'Your organisation has been suspended. Contact NOUR.'
        : 'Your organisation is pending approval. You will be notified once approved.'
    return NextResponse.json({ error: msg, status: org?.status ?? 'pending' }, { status: 403 })
  }

  const token = await createNgoSession(
    user.id as string,
    user.org_id as string,
    user.role as NgoRole,
  )

  const response = NextResponse.json({ success: true, role: user.role })
  setNgoCookie(response as unknown as Response, token)
  return response
}
