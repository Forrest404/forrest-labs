import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

// NGO custom incidents (911-style). Org-scoped; org_admin + team_leader manage them.
export const SEVERITIES = ['low', 'medium', 'high', 'critical']
export const CATEGORIES = ['medical', 'fire', 'rescue', 'flood', 'shelter', 'security', 'other']

export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('ngo_incidents')
    .select('id, title, category, severity, description, address, lat, lon, status, created_at')
    .eq('org_id', session!.orgId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Could not load incidents' }, { status: 500 })
  return NextResponse.json({ incidents: data ?? [] })
}

export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  let body: { title?: string; category?: string; severity?: string; description?: string; address?: string; lat?: unknown; lon?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const title = String(body.title ?? '').trim()
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  const lat = Number(body.lat), lon = Number(body.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return NextResponse.json({ error: 'A location (lat/lon) is required' }, { status: 400 })
  const severity = SEVERITIES.includes(String(body.severity)) ? String(body.severity) : 'medium'
  const category = body.category && CATEGORIES.includes(String(body.category)) ? String(body.category) : (body.category ? 'other' : null)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('ngo_incidents')
    .insert({
      org_id: session!.orgId, title, category, severity,
      description: body.description ? String(body.description).slice(0, 2000) : null,
      address: body.address ? String(body.address).slice(0, 500) : null,
      lat, lon, created_by: session!.userId,
    })
    .select('id')
    .single()
  if (error || !data) return NextResponse.json({ error: 'Could not create incident' }, { status: 500 })
  return NextResponse.json({ success: true, id: data.id })
}
