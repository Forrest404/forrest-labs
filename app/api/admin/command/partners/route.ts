import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest, hashPartnerPassword, generatePartnerPassword } from '@/lib/admin/auth'
import { writeAuditLog } from '@/lib/admin/audit'

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data } = await supabase
    .from('partner_accounts')
    .select('id, email, role, active, last_login, created_at, organisation_id, organisations (id, name)')
    .order('created_at', { ascending: false })

  return NextResponse.json({ partners: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: { organisation_id?: string; email?: string; role?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.organisation_id || !body.email) {
    return NextResponse.json({ error: 'organisation_id and email required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Check org exists
  const { data: org } = await supabase.from('organisations').select('id').eq('id', body.organisation_id).single()
  if (!org) {
    return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })
  }

  const tempPassword = generatePartnerPassword()
  const passwordHash = hashPartnerPassword(tempPassword)

  const { data, error } = await supabase
    .from('partner_accounts')
    .insert({
      organisation_id: body.organisation_id,
      email: body.email.toLowerCase().trim(),
      password_hash: passwordHash,
      role: body.role ?? 'coordinator',
    })
    .select('id, email, role')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }
    console.error('[partners/create]', error.message)
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
  }

  await writeAuditLog({
    action: 'partner_created',
    entityType: 'partner_account',
    entityId: data.id as string,
    sessionId: session.sessionId,
    notes: `Partner account created for ${body.email}`,
  })

  return NextResponse.json({ success: true, temp_password: tempPassword, email: data.email })
}
