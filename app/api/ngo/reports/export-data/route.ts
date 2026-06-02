import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { gatherOrgReportData } from '@/lib/ngo-reports'

// GET /api/ngo/reports/export-data?format=csv|geojson&start=&end=
// Streams this org's incidents + dispatches for a date range as CSV or GeoJSON.
// org-scoped (only this org's data); org_admin + team_leader only.

function csvCell(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const sp = request.nextUrl.searchParams
  const format = sp.get('format') === 'geojson' ? 'geojson' : 'csv'
  const start = (sp.get('start') ?? '').trim()
  const end = (sp.get('end') ?? '').trim()
  if (!start || !end || isNaN(new Date(start).getTime()) || isNaN(new Date(end).getTime())) {
    return NextResponse.json({ error: 'Valid start and end are required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const gathered = await gatherOrgReportData(supabase, session!.orgId, start, end)
  const dateStr = new Date().toISOString().slice(0, 10)

  if (format === 'geojson') {
    const features = [
      ...gathered.incidents.map((i) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [i.lon, i.lat] },
        properties: {
          kind: 'incident',
          id: i.id,
          location_name: i.location_name,
          event_types: i.event_types,
          source: i.source,
          confidence_score: i.confidence_score,
          report_count: i.report_count,
          created_at: i.created_at,
        },
      })),
      // Dispatches carry no coordinates of their own; include them as non-geometry
      // features so the export is complete without inventing positions.
      ...gathered.dispatches.map((d) => ({
        type: 'Feature' as const,
        geometry: null,
        properties: {
          kind: 'dispatch',
          id: d.id,
          status: d.status,
          team_name: d.team_name,
          team_type: d.team_type,
          assigned_at: d.assigned_at,
          on_scene_at: d.on_scene_at,
          done_at: d.done_at,
          people_assisted: d.people_assisted,
          services: d.services,
          new_hazards: d.new_hazards,
        },
      })),
    ]
    const fc = { type: 'FeatureCollection' as const, features, metadata: { period_start: start, period_end: end, source: 'NOUR (org-scoped)' } }
    return new NextResponse(JSON.stringify(fc, null, 2), {
      headers: {
        'Content-Type': 'application/geo+json',
        'Content-Disposition': `attachment; filename="nour-ngo-export-${dateStr}.geojson"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  // CSV: two sections (incidents, then dispatches) in one file, each with a header.
  const incHeader = ['kind', 'id', 'location_name', 'lat', 'lon', 'event_types', 'source', 'confidence_score', 'report_count', 'created_at']
  const incRows = gathered.incidents.map((i) =>
    ['incident', i.id, i.location_name, i.lat, i.lon, (i.event_types ?? []).join(';'), i.source, i.confidence_score, i.report_count, i.created_at].map(csvCell).join(','),
  )
  const dispHeader = ['kind', 'id', 'status', 'team_name', 'team_type', 'assigned_at', 'on_scene_at', 'done_at', 'people_assisted', 'services', 'new_hazards']
  const dispRows = gathered.dispatches.map((d) =>
    ['dispatch', d.id, d.status, d.team_name, d.team_type, d.assigned_at, d.on_scene_at, d.done_at, d.people_assisted, d.services, d.new_hazards].map(csvCell).join(','),
  )
  const csv = [
    `# NOUR NGO data export — period ${start} to ${end}`,
    '# INCIDENTS',
    incHeader.join(','),
    ...incRows,
    '',
    '# DISPATCHES',
    dispHeader.join(','),
    ...dispRows,
  ].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="nour-ngo-export-${dateStr}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
