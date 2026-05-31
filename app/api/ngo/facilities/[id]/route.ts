import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

const TYPES = ['hospital', 'clinic', 'field_hospital', 'shelter', 'distribution', 'safe_area', 'fuel', 'water', 'other']
const STATUSES = ['open', 'closed', 'full', 'unknown']

// PATCH /api/ngo/facilities/[id] — update a facility (managers only, org-scoped).
// Sending just { status } is the one-tap status change: it also stamps
// status_updated_at = now() so stale status is visible.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.name !== undefined) {
    const name = (body.name ?? '').toString().trim()
    if (!name) return NextResponse.json({ error: 'A name is required.' }, { status: 400 })
    update.name = name.slice(0, 160)
  }
  if (body.type !== undefined) {
    if (!TYPES.includes(body.type)) return NextResponse.json({ error: 'Invalid type.' }, { status: 400 })
    update.type = body.type
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
    update.status = body.status
    update.status_updated_at = new Date().toISOString() // fresh status timestamp
  }
  if (body.lat !== undefined) update.lat = numOrNull(body.lat)
  if (body.lon !== undefined) update.lon = numOrNull(body.lon)
  if (body.capacity_note !== undefined) update.capacity_note = str(body.capacity_note)
  if (body.phone !== undefined) update.phone = str(body.phone)
  if (body.address !== undefined) update.address = str(body.address)
  if (body.notes !== undefined) update.notes = str(body.notes)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('facilities')
    .update(update)
    .eq('id', id)
    .eq('org_id', session!.orgId) // org-scope
    .select('id, status, status_updated_at')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
  return NextResponse.json({ success: true, status: data.status, status_updated_at: data.status_updated_at })
}

// DELETE /api/ngo/facilities/[id] — remove a facility (managers only, org-scoped).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('facilities')
    .delete()
    .eq('id', id)
    .eq('org_id', session!.orgId)
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
  return NextResponse.json({ success: true })
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
