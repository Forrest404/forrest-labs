import { pointInPolygon } from '@/lib/ngo-geo'

// Shared, org-scoped data gathering for NGO reports (sitrep generation + data
// export). Pulls verified incidents within the org's operational area and the
// org's own dispatches + on-scene reports for a date range. READ-ONLY on the
// civilian pipeline (clusters); writes nothing. Used by both
// /api/ngo/reports/generate and /api/ngo/reports/export-data so the two always
// agree on what "this org's data for this range" means.

// Statuses the public map shows — kept identical to the board.
const INCIDENT_STATUSES = ['confirmed', 'auto_confirmed', 'news_verified', 'official_verified']

export interface GatheredIncident {
  id: string
  location_name: string | null
  lat: number
  lon: number
  confidence_score: number | null
  report_count: number | null
  event_types: string[]
  source: string
  created_at: string
}

export interface GatheredDispatch {
  id: string
  status: string
  team_name: string | null
  team_type: string | null
  assigned_at: string
  on_scene_at: string | null
  done_at: string | null
  people_assisted: number | null
  services: string | null
  new_hazards: string | null
}

export interface GatheredData {
  area_defined: boolean
  incidents: GatheredIncident[]
  dispatches: GatheredDispatch[]
  figures: {
    incident_count: number
    dispatch_count: number
    dispatches_by_status: Record<string, number>
    total_people_assisted: number
    new_hazards_reported: number
  }
}

// supabase: a service client (createServiceClient()). orgId/start/end pre-validated.
export async function gatherOrgReportData(
  supabase: any,
  orgId: string,
  start: string,
  end: string,
): Promise<GatheredData> {
  // 1. Operational area polygon (may be null until an org_admin draws one).
  const { data: org } = await supabase
    .from('ngo_organisations')
    .select('operational_area')
    .eq('id', orgId)
    .single()
  const area = (org?.operational_area as { type?: string; coordinates?: number[][][] } | null) ?? null

  // 2. Verified incidents in range, then filtered to the org's area (point-in-polygon).
  const { data: clusters } = await supabase
    .from('clusters')
    .select('id, centroid_lat, centroid_lon, location_name, confidence_score, report_count, dominant_event_types, source_name, status, created_at')
    .in('status', INCIDENT_STATUSES)
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: false })
    .limit(1000)

  const incidents: GatheredIncident[] = (clusters ?? [])
    .filter((c: any) => (area ? pointInPolygon(c.centroid_lon, c.centroid_lat, area) : false))
    .map((c: any) => ({
      id: c.id,
      location_name: c.location_name ?? null,
      lat: c.centroid_lat,
      lon: c.centroid_lon,
      confidence_score: c.confidence_score ?? null,
      report_count: c.report_count ?? null,
      event_types: Array.isArray(c.dominant_event_types) ? c.dominant_event_types : [],
      source: c.source_name ?? 'civilian',
      created_at: c.created_at,
    }))

  // 3. This org's dispatches in range + their on-scene reports.
  const { data: disp } = await supabase
    .from('ngo_dispatches')
    .select('id, status, assigned_at, on_scene_at, done_at, ngo_teams ( name, type ), on_scene_reports ( people_assisted, services, new_hazards )')
    .eq('org_id', orgId)
    .gte('assigned_at', start)
    .lte('assigned_at', end)
    .order('assigned_at', { ascending: false })

  const dispatches: GatheredDispatch[] = (disp ?? []).map((d: any) => {
    const team = Array.isArray(d.ngo_teams) ? d.ngo_teams[0] : d.ngo_teams
    const osr = Array.isArray(d.on_scene_reports) ? d.on_scene_reports[0] : d.on_scene_reports
    return {
      id: d.id,
      status: d.status,
      team_name: team?.name ?? null,
      team_type: team?.type ?? null,
      assigned_at: d.assigned_at,
      on_scene_at: d.on_scene_at ?? null,
      done_at: d.done_at ?? null,
      people_assisted: osr?.people_assisted ?? null,
      services: osr?.services ?? null,
      new_hazards: osr?.new_hazards ?? null,
    }
  })

  // 4. Key figures.
  const dispatches_by_status: Record<string, number> = {}
  let total_people_assisted = 0
  let new_hazards_reported = 0
  for (const d of dispatches) {
    dispatches_by_status[d.status] = (dispatches_by_status[d.status] ?? 0) + 1
    if (typeof d.people_assisted === 'number') total_people_assisted += d.people_assisted
    if (d.new_hazards && d.new_hazards.trim()) new_hazards_reported += 1
  }

  return {
    area_defined: !!area,
    incidents,
    dispatches,
    figures: {
      incident_count: incidents.length,
      dispatch_count: dispatches.length,
      dispatches_by_status,
      total_people_assisted,
      new_hazards_reported,
    },
  }
}
