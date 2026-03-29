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
  const status = searchParams.get('status')

  let query = supabase
    .from('teams')
    .select('id, name, status, team_type, current_lat, current_lon, location_name, capacity, notes, updated_at, organisation_id, organisations (id, name)')
    .order('name')

  if (orgId) query = query.eq('organisation_id', orgId)
  if (status) query = query.eq('status', status)

  const { data } = await query

  return NextResponse.json({ teams: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: { name?: string; organisation_id?: string; team_type?: string; capacity?: number; location_name?: string; notes?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, organisation_id, team_type, capacity, location_name, notes } = body

  if (!name || !organisation_id || !team_type) {
    return NextResponse.json({ error: 'name, organisation_id, and team_type required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Verify org exists
  const { data: org } = await supabase.from('organisations').select('id').eq('id', organisation_id).single()
  if (!org) {
    return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('teams')
    .insert({
      name,
      organisation_id,
      team_type,
      capacity: capacity ?? 4,
      location_name: location_name ?? null,
      notes: notes ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('[teams/create]', error.message)
    return NextResponse.json({ error: 'Failed to create team' }, { status: 500 })
  }

  return NextResponse.json({ success: true, team: data }, { status: 201 })
}
