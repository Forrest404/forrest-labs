import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

const ORG_TYPES = ['ingo', 'lngo', 'un_agency', 'crescent_cross', 'community', 'other']

// The caller's own organisation profile + settings. GET for org_admin/team_leader;
// PATCH (org_admin) edits name/type/country/check-in window/data-sharing toggles.
export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('ngo_organisations')
    .select('id, name, type, country, status, checkin_window_minutes, share_team_presence, share_operational_area, operational_area, created_at')
    .eq('id', session!.orgId)
    .single()
  if (error || !data) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })
  return NextResponse.json({
    org: {
      id: data.id,
      name: data.name,
      type: data.type,
      country: data.country,
      status: data.status,
      checkin_window_minutes: (data as any).checkin_window_minutes ?? 240,
      share_team_presence: data.share_team_presence ?? false,
      share_operational_area: data.share_operational_area ?? false,
      has_operational_area: !!data.operational_area,
      created_at: data.created_at,
    },
  })
}

export async function PATCH(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const update: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    update.name = name
  }
  if (body.type !== undefined) {
    const type = String(body.type)
    if (!ORG_TYPES.includes(type)) return NextResponse.json({ error: 'Invalid organisation type' }, { status: 400 })
    update.type = type
  }
  if (body.country !== undefined) update.country = body.country ? String(body.country).trim() : null
  if (body.checkin_window_minutes !== undefined) {
    const w = Number(body.checkin_window_minutes)
    if (!Number.isFinite(w) || w < 15 || w > 10080) {
      return NextResponse.json({ error: 'Check-in window must be 15–10080 minutes' }, { status: 400 })
    }
    update.checkin_window_minutes = Math.round(w)
  }
  if (body.share_team_presence !== undefined) update.share_team_presence = !!body.share_team_presence
  if (body.share_operational_area !== undefined) update.share_operational_area = !!body.share_operational_area

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('ngo_organisations').update(update).eq('id', session!.orgId)
  if (error) return NextResponse.json({ error: 'Could not save settings' }, { status: 500 })
  return NextResponse.json({ success: true })
}
