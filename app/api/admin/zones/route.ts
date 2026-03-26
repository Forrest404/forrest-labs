import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

export async function GET() {
  const supabase = createServiceClient()

  const { data } = await supabase
    .from('admin_zones')
    .select('*')
    .order('created_at', { ascending: false })

  return NextResponse.json(
    { zones: data ?? [] },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: {
    name?: string
    zone_type?: string
    geojson?: Record<string, unknown>
    colour?: string
    notes?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, zone_type, geojson, colour, notes } = body

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }
  if (!zone_type || typeof zone_type !== 'string') {
    return NextResponse.json({ error: 'zone_type required' }, { status: 400 })
  }
  if (!geojson || typeof geojson !== 'object') {
    return NextResponse.json({ error: 'geojson required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('admin_zones')
    .insert({
      name,
      zone_type,
      geojson,
      colour: colour ?? '#3fb950',
      notes: notes ?? null,
      created_by: session.sessionId.slice(0, 8),
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to create zone' }, { status: 500 })
  }

  return NextResponse.json({ success: true, zone: data }, { status: 201 })
}
