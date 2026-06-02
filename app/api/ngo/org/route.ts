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
      panic_ack_visible_default: (data as any).panic_ack_visible_default ?? true,
      panic_escalation_minutes: (data as any).panic_escalation_minutes ?? 5,
      location_retention_hours: (data as any).location_retention_hours ?? 48,
      alert_new_incident: (data as any).alert_new_incident ?? true,
      alert_missed_checkin: (data as any).alert_missed_checkin ?? true,
      alert_panic: (data as any).alert_panic ?? true,
      alert_low_ack: (data as any).alert_low_ack ?? true,
      share_team_presence: data.share_team_presence ?? false,
      share_operational_area: data.share_operational_area ?? false,
      has_operational_area: !!data.operational_area,
      created_at: data.created_at,
    },
    // Read-only provider-configured status for the Integrations section (booleans only,
    // never the keys themselves). Push uses a per-org ntfy topic (auto-provisioned).
    providers: {
      push: true,
      sms: !!process.env.SMS_PROVIDER_URL,
      email: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    },
  })
}

export async function PATCH(request: NextRequest) {
  const session = await getNgoSession(request)
  // team_leader may edit the SAFETY subset (check-in window, panic escalation, ack
  // visibility); everything else (profile, sharing, retention, alert defaults) is
  // org_admin-only. Field-level gating below enforces this on the API.
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const isAdmin = session!.role === 'org_admin'
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  // org_admin-only fields: reject if a non-admin tries to set any of them.
  const ADMIN_ONLY = ['name', 'type', 'country', 'share_team_presence', 'share_operational_area', 'location_retention_hours', 'alert_new_incident', 'alert_missed_checkin', 'alert_panic', 'alert_low_ack']
  if (!isAdmin && ADMIN_ONLY.some((k) => body[k] !== undefined)) {
    return NextResponse.json({ error: 'Only an org admin can change these settings.' }, { status: 403 })
  }

  // Fields backed by columns that definitely exist (foundation migration). Admin-only.
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
  // Cross-org sharing — DEFAULT OFF (foundation migration) and currently NOT consumed by
  // any feature. CONTRACT for whoever builds inter-agency sharing: when one of these is
  // on, share only team TYPE + a ROUGH AREA (coarsen() in lib/ngo-geo.ts) — never names,
  // never precise pins. Aid-worker location is targeting data.
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

  // Location retention (hours) — additive column; saved separately so a missing column
  // doesn't 500. 1h..720h (30 days). Lower = a breach exposes less location history.
  let retentionValue: number | null = null
  if (body.location_retention_hours !== undefined) {
    const h = Number(body.location_retention_hours)
    if (!Number.isFinite(h) || h < 1 || h > 720) {
      return NextResponse.json({ error: 'Retention must be 1–720 hours' }, { status: 400 })
    }
    retentionValue = Math.round(h)
  }

  // Panic config (revamp migration). Saved separately so a missing column doesn't 500.
  const panicUpdate: Record<string, unknown> = {}
  if (body.panic_ack_visible_default !== undefined) panicUpdate.panic_ack_visible_default = !!body.panic_ack_visible_default
  if (body.panic_escalation_minutes !== undefined) {
    const e = Number(body.panic_escalation_minutes)
    if (!Number.isFinite(e) || e < 1 || e > 1440) {
      return NextResponse.json({ error: 'Escalation window must be 1–1440 minutes' }, { status: 400 })
    }
    panicUpdate.panic_escalation_minutes = Math.round(e)
  }

  // Org-wide alert defaults (admin-only; additive columns, saved tolerantly).
  const alertUpdate: Record<string, unknown> = {}
  for (const k of ['alert_new_incident', 'alert_missed_checkin', 'alert_panic', 'alert_low_ack'] as const) {
    if (body[k] !== undefined) alertUpdate[k] = !!body[k]
  }

  if (Object.keys(base).length === 0 && windowValue === null && retentionValue === null && Object.keys(panicUpdate).length === 0 && Object.keys(alertUpdate).length === 0) {
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
  let panicConfigSaved: boolean | null = null
  if (Object.keys(panicUpdate).length) {
    const { error } = await supabase.from('ngo_organisations').update(panicUpdate).eq('id', session!.orgId)
    panicConfigSaved = !error
  }
  let retentionSaved: boolean | null = null
  if (retentionValue !== null) {
    const { error } = await supabase.from('ngo_organisations').update({ location_retention_hours: retentionValue }).eq('id', session!.orgId)
    retentionSaved = !error
  }
  let alertsSaved: boolean | null = null
  if (Object.keys(alertUpdate).length) {
    const { error } = await supabase.from('ngo_organisations').update(alertUpdate).eq('id', session!.orgId)
    alertsSaved = !error
  }
  return NextResponse.json({ success: true, checkin_window_saved: checkinWindowSaved, panic_config_saved: panicConfigSaved, retention_saved: retentionSaved, alerts_saved: alertsSaved })
}
