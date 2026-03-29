import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const searchParams = request.nextUrl.searchParams
  const orgId = searchParams.get('org_id')
  const lowStock = searchParams.get('low_stock') === 'true'

  let query = supabase
    .from('resources')
    .select('id, resource_type, name, quantity_total, quantity_available, unit, low_stock_threshold, notes, updated_at, organisation_id, organisations (id, name)')
    .order('resource_type')

  if (orgId) query = query.eq('organisation_id', orgId)

  const { data } = await query

  interface ResourceRow { quantity_available: number; low_stock_threshold: number }
  const results = lowStock
    ? ((data as ResourceRow[] | null) ?? []).filter((r) => r.quantity_available <= r.low_stock_threshold)
    : (data ?? [])

  return NextResponse.json({ resources: results }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: {
    organisation_id?: string
    resource_type?: string
    name?: string
    quantity_total?: number
    quantity_available?: number
    unit?: string
    low_stock_threshold?: number
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.organisation_id || !body.resource_type || !body.name) {
    return NextResponse.json({ error: 'organisation_id, resource_type, and name required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('resources')
    .insert({
      organisation_id: body.organisation_id,
      resource_type: body.resource_type,
      name: body.name,
      quantity_total: body.quantity_total ?? 0,
      quantity_available: body.quantity_available ?? 0,
      unit: body.unit ?? 'units',
      low_stock_threshold: body.low_stock_threshold ?? 10,
    })
    .select()
    .single()

  if (error) {
    console.error('[resources/create]', error.message)
    return NextResponse.json({ error: 'Failed to create resource' }, { status: 500 })
  }

  return NextResponse.json({ success: true, resource: data }, { status: 201 })
}
