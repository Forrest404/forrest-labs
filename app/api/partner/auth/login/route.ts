import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { verifyPartnerPassword, hashPartnerPasswordScrypt, createPartnerSession } from '@/lib/admin/auth'

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { email, password } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: account } = await supabase
    .from('partner_accounts')
    .select('id, password_hash, role, active, organisation_id, organisations (id, name, type, operational_area, active)')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (!account || !(account.active as boolean)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  // Verify against scrypt or legacy sha256 (security H4). On a successful legacy
  // verification, transparently upgrade the stored hash to salted scrypt.
  const { ok, needsRehash } = verifyPartnerPassword(password, account.password_hash as string | null)
  if (!ok) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  await supabase
    .from('partner_accounts')
    .update({
      last_login: new Date().toISOString(),
      ...(needsRehash ? { password_hash: hashPartnerPasswordScrypt(password) } : {}),
    })
    .eq('id', account.id)

  const token = await createPartnerSession(
    account.id as string,
    account.organisation_id as string,
    account.role as string,
  )

  const response = NextResponse.json({
    success: true,
    organisation: account.organisations,
    role: account.role,
  })

  response.headers.set(
    'Set-Cookie',
    ['fl_partner_session=' + token, 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=43200'].join('; '),
  )

  return response
}
