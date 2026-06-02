import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data } = await supabase
    .from('organisations')
    .select('id, name, type, contact_email, contact_name, operational_area, active, created_at')
    .eq('active', true)
    .order('name')

  return NextResponse.json({ organisations: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: { name?: string; type?: string; contact_email?: string; contact_name?: string; operational_area?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.name || !body.type) {
    return NextResponse.json({ error: 'name and type required' }, { status: 400 })
  }

  // Cap untrusted text so a malformed/oversized field can't be persisted unbounded.
  const cap = (v: unknown, n: number): string | null => {
    const s = (v ?? '').toString().trim()
    return s ? s.slice(0, n) : null
  }
  const name = cap(body.name, 200)
  const type = cap(body.type, 60)
  if (!name || !type) {
    return NextResponse.json({ error: 'name and type required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('organisations')
    .insert({
      name,
      type,
      contact_email: cap(body.contact_email, 200),
      contact_name: cap(body.contact_name, 200),
      operational_area: cap(body.operational_area, 8000),
    })
    .select()
    .single()

  if (error) {
    console.error('[organisations/create]', error.message)
    return NextResponse.json({ error: 'Failed to create organisation' }, { status: 500 })
  }

  return NextResponse.json({ success: true, organisation: data }, { status: 201 })
}
