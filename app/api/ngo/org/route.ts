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
  // select('*') so a missing checkin_window_minutes column (migration not yet
  // applied) doesn't error the query — fall back to the default below.
  const { data, error } = await supabase
    .from('ngo_organisations')
    .select('*')
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

  // Fields backed by columns that definitely exist (foundation migration).
  const base: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    base.name = name
  }
  if (body.type !== undefined) {
    const type = String(body.type)
    if (!ORG_TYPES.includes(type)) return NextResponse.json({ error: 'Invalid organisation type' }, { status: 400 })
    base.type = type
  }
  if (body.country !== undefined) base.country = body.country ? String(body.country).trim() : null
  if (body.share_team_presence !== undefined) base.share_team_presence = !!body.share_team_presence
  if (body.share_operational_area !== undefined) base.share_operational_area = !!body.share_operational_area

  let windowValue: number | null = null
  if (body.checkin_window_minutes !== undefined) {
    const w = Number(body.checkin_window_minutes)
    if (!Number.isFinite(w) || w < 15 || w > 10080) {
      return NextResponse.json({ error: 'Check-in window must be 15–10080 minutes' }, { status: 400 })
    }
    windowValue = Math.round(w)
  }

  if (Object.keys(base).length === 0 && windowValue === null) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const supabase = createServiceClient()
  if (Object.keys(base).length) {
    const { error } = await supabase.from('ngo_organisations').update(base).eq('id', session!.orgId)
    if (error) return NextResponse.json({ error: 'Could not save settings' }, { status: 500 })
  }
  // The check-in window lives in an additive migration that may not be applied yet;
  // save it separately and report if the column is missing rather than 500.
  let checkinWindowSaved: boolean | null = null
  if (windowValue !== null) {
    const { error } = await supabase.from('ngo_organisations').update({ checkin_window_minutes: windowValue }).eq('id', session!.orgId)
    checkinWindowSaved = !error
  }
  return NextResponse.json({ success: true, checkin_window_saved: checkinWindowSaved })
}
