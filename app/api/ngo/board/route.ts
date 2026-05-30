import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

// Situation-board data for the caller's organisation. READ-ONLY on clusters —
// the board never writes to the verification pipeline. Everything is scoped to
// session.orgId. Returns incidents (with inside/covered flags), the org's team
// pins, and the operational-area polygon.

// Statuses the public map (app/map/page.tsx) shows — kept identical here.
const INCIDENT_STATUSES = ['confirmed', 'auto_confirmed', 'news_verified', 'official_verified']
// A dispatch counts as "covering" an incident while it is still in progress.
const ACTIVE_DISPATCH = ['assigned', 'en_route', 'on_scene']

// Ray-casting point-in-polygon over a GeoJSON Polygon's outer ring ([lon,lat]).
export function pointInPolygon(
  lon: number,
  lat: number,
  polygon: { type?: string; coordinates?: number[][][] } | null | undefined,
): boolean {
  const ring = polygon?.coordinates?.[0]
  if (!Array.isArray(ring) || ring.length < 4) return false
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const orgId = session!.orgId
  const supabase = createServiceClient()

  // Operational area (may be null until an org_admin draws one).
  const { data: org } = await supabase
    .from('ngo_organisations')
    .select('operational_area')
    .eq('id', orgId)
    .single()
  const area = (org?.operational_area as { type?: string; coordinates?: number[][][] } | null) ?? null

  // Incidents — verified clusters, newest first. READ ONLY.
  const { data: clusters } = await supabase
    .from('clusters')
    .select('id, centroid_lat, centroid_lon, report_count, confidence_score, display_radius_metres, status, created_at')
    .in('status', INCIDENT_STATUSES)
    .order('created_at', { ascending: false })
    .limit(500)

  // Active dispatches for this org → which clusters are currently covered.
  const { data: dispatches } = await supabase
    .from('ngo_dispatches')
    .select('cluster_id')
    .eq('org_id', orgId)
    .in('status', ACTIVE_DISPATCH)
  const covered = new Set((dispatches ?? []).map((d) => d.cluster_id).filter(Boolean))

  const incidents = (clusters ?? []).map((c) => ({
    id: c.id,
    lat: c.centroid_lat,
    lon: c.centroid_lon,
    status: c.status,
    confidence_score: c.confidence_score,
    report_count: c.report_count,
    created_at: c.created_at,
    radius_metres: c.display_radius_metres ?? 150,
    inside: area ? pointInPolygon(c.centroid_lon, c.centroid_lat, area) : false,
    covered: covered.has(c.id),
  }))

  // Team pins — one per team that has a known location.
  const { data: teams } = await supabase
    .from('ngo_teams')
    .select('id, name, type, team_status ( status, last_lat, last_lon, last_seen_at )')
    .eq('org_id', orgId)

  const teamPins = (teams ?? [])
    .map((t: any) => {
      const s = Array.isArray(t.team_status) ? t.team_status[0] : t.team_status
      return {
        id: t.id,
        name: t.name,
        type: t.type,
        status: s?.status ?? 'offline',
        lat: s?.last_lat ?? null,
        lon: s?.last_lon ?? null,
        last_seen_at: s?.last_seen_at ?? null,
      }
    })
    .filter((t) => t.lat != null && t.lon != null)

  return NextResponse.json({
    operational_area: area,
    incidents,
    teams: teamPins,
    generated_at: new Date().toISOString(),
  })
}
