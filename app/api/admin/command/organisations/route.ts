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

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('organisations')
    .insert({
      name: body.name,
      type: body.type,
      contact_email: body.contact_email ?? null,
      contact_name: body.contact_name ?? null,
      operational_area: body.operational_area ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('[organisations/create]', error.message)
    return NextResponse.json({ error: 'Failed to create organisation' }, { status: 500 })
  }

  return NextResponse.json({ success: true, organisation: data }, { status: 201 })
}
