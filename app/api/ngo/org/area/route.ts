import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { validatePolygon } from '@/lib/ngo-geo'
import { readJsonBody, LARGE_MAX_BODY } from '@/lib/http'

// Operational area for the caller's organisation. Stored on
// ngo_organisations.operational_area as a single GeoJSON Polygon geometry:
//   { type: 'Polygon', coordinates: [[ [lon,lat], …, [lon,lat] ]] }  (closed ring)
// All access is scoped to the org_id carried by the session.

export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('ngo_organisations')
    .select('operational_area')
    .eq('id', session!.orgId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })
  }
  // operational_area may hold a free-text {description} note from signup (kept until
  // the org draws a polygon here). Only return it when it is an actual GeoJSON
  // Polygon, so the map editor never receives a non-drawable shape and crashes.
  const area = isPolygon(data.operational_area) ? data.operational_area : null
  return NextResponse.json({ area })
}

function isPolygon(area: unknown): area is { type: 'Polygon'; coordinates: number[][][] } {
  if (!area || typeof area !== 'object') return false
  const a = area as { type?: unknown; coordinates?: unknown }
  if (a.type !== 'Polygon') return false
  if (!Array.isArray(a.coordinates) || a.coordinates.length === 0) return false
  const ring = a.coordinates[0]
  // A polygon ring needs at least 4 positions (3 distinct + closing point).
  return Array.isArray(ring) && ring.length >= 4
}

export async function PUT(request: NextRequest) {
  const session = await getNgoSession(request)
  // Editing the operational area is an org_admin power only.
  if (!requireRole(session, ['org_admin'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  const parsed = await readJsonBody<{ area?: unknown }>(request, LARGE_MAX_BODY)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  // null clears the area; otherwise it must be a valid, bounded closed polygon. Store the
  // NORMALIZED polygon (range-checked, vertex-capped) rather than the raw input.
  const clearing = body.area === null
  const area = clearing ? null : validatePolygon(body.area)
  if (!clearing && !area) {
    return NextResponse.json({ error: 'A valid closed GeoJSON Polygon is required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('ngo_organisations')
    .update({ operational_area: area })
    .eq('id', session!.orgId)

  if (error) {
    return NextResponse.json({ error: 'Could not save operational area' }, { status: 500 })
  }
  return NextResponse.json({ success: true, area })
}
