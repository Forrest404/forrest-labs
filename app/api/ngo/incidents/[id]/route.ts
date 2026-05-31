import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { SEVERITIES, CATEGORIES } from '../route'

// Edit / resolve / delete a custom incident. Org-scoped.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const update: Record<string, unknown> = {}
  if (body.title !== undefined) { const t = String(body.title).trim(); if (!t) return NextResponse.json({ error: 'Title is required' }, { status: 400 }); update.title = t }
  if (body.category !== undefined) update.category = body.category ? (CATEGORIES.includes(String(body.category)) ? String(body.category) : 'other') : null
  if (body.severity !== undefined) { if (!SEVERITIES.includes(String(body.severity))) return NextResponse.json({ error: 'Invalid severity' }, { status: 400 }); update.severity = body.severity }
  if (body.description !== undefined) update.description = body.description ? String(body.description).slice(0, 2000) : null
  if (body.address !== undefined) update.address = body.address ? String(body.address).slice(0, 500) : null
  if (body.lat !== undefined && body.lon !== undefined) {
    const lat = Number(body.lat), lon = Number(body.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return NextResponse.json({ error: 'Invalid location' }, { status: 400 })
    update.lat = lat; update.lon = lon
  }
  if (body.status !== undefined) {
    if (!['open', 'resolved', 'dismissed'].includes(String(body.status))) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    update.status = body.status
    // 'resolved' (dealt with) and 'dismissed' (not actionable) both close the incident;
    // 'open' reopens it and clears the closure stamp.
    const closing = body.status === 'resolved' || body.status === 'dismissed'
    update.resolved_at = closing ? new Date().toISOString() : null
    update.resolved_by = closing ? session!.userId : null
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('ngo_incidents').update(update).eq('id', id).eq('org_id', session!.orgId).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not update incident' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('ngo_incidents').delete().eq('id', id).eq('org_id', session!.orgId).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not delete incident' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
