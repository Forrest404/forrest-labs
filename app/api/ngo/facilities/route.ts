import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

const TYPES = ['hospital', 'clinic', 'field_hospital', 'shelter', 'distribution', 'safe_area', 'fuel', 'water', 'other']
const STATUSES = ['open', 'closed', 'full', 'unknown']
const FIELDS = 'id, name, type, lat, lon, status, capacity_note, phone, address, notes, source, status_updated_at, created_at, updated_at'

// GET /api/ngo/facilities — list this org's facilities. Any signed-in member may view
// (field coordinators need "where do we take people" + tap-to-call).
export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader', 'field_coordinator'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('facilities')
    .select(FIELDS)
    .eq('org_id', session!.orgId)
    .order('name', { ascending: true })
  if (error) {
    console.error('facilities load failed:', error)
    return NextResponse.json({ error: 'Could not load facilities' }, { status: 500 })
  }
  return NextResponse.json(
    { facilities: data ?? [], can_manage: session!.role === 'org_admin' || session!.role === 'team_leader' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

// POST /api/ngo/facilities — create. Managers only.
export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

  const name = (body.name ?? '').toString().trim()
  if (!name) return NextResponse.json({ error: 'A name is required.' }, { status: 400 })
  if (name.length > 160) return NextResponse.json({ error: 'Name is too long.' }, { status: 400 })

  const type = TYPES.includes(body.type) ? body.type : 'other'
  const status = STATUSES.includes(body.status) ? body.status : 'unknown'
  const lat = numOrNull(body.lat)
  const lon = numOrNull(body.lon)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('facilities')
    .insert({
      org_id: session!.orgId,
      name, type, status,
      lat, lon,
      capacity_note: str(body.capacity_note),
      phone: str(body.phone),
      address: str(body.address),
      notes: str(body.notes),
      source: 'user',
      // A facility created with a known status records when that was set.
      status_updated_at: status !== 'unknown' ? new Date().toISOString() : null,
      created_by: session!.userId,
    })
    .select('id')
    .single()
  if (error) {
    console.error('facility create failed:', error)
    return NextResponse.json({ error: 'Could not save the facility' }, { status: 500 })
  }
  return NextResponse.json({ success: true, id: data.id })
}

function str(v: unknown): string | null {
  const s = (v ?? '').toString().trim()
  return s ? s.slice(0, 1000) : null
}
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
