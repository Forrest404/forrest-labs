import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { resolveTeamId } from '@/lib/ngo-safety'
import { ACTIVE_DISPATCH, geocode, hazardOf, mapLink } from '@/lib/ngo-dispatch'

// The field coordinator's current active dispatch (+ incident detail), for the
// mobile view. Null if their team has no active dispatch.
export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['field_coordinator'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const teamId = await resolveTeamId(supabase, session!.userId)
  if (!teamId) return NextResponse.json({ dispatch: null })

  const { data: d } = await supabase
    .from('ngo_dispatches')
    .select('id, cluster_id, ngo_incident_id, status, note, assigned_at, en_route_at, on_scene_at')
    .eq('team_id', teamId)
    .in('status', ACTIVE_DISPATCH)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!d) return NextResponse.json({ dispatch: null })

  let place: string | null = null, hazard: string | null = null, link: string | null = null
  let title: string | null = null, severity: string | null = null, description: string | null = null
  if (d.ngo_incident_id) {
    // Custom (org-created) incident — show its full details en route.
    const { data: inc } = await supabase
      .from('ngo_incidents').select('title, category, severity, description, address, lat, lon').eq('id', d.ngo_incident_id).maybeSingle()
    if (inc) {
      title = inc.title; severity = inc.severity; description = inc.description
      hazard = inc.category ?? null
      place = inc.address || `${inc.lat.toFixed(4)}, ${inc.lon.toFixed(4)}`
      link = mapLink(inc.lat, inc.lon)
    }
  } else if (d.cluster_id) {
    const { data: cluster } = await supabase
      .from('clusters').select('centroid_lat, centroid_lon, dominant_event_types').eq('id', d.cluster_id).maybeSingle()
    if (cluster) {
      place = await geocode(cluster.centroid_lat, cluster.centroid_lon)
      hazard = hazardOf(cluster)?.replace(/_/g, ' ') ?? null
      link = mapLink(cluster.centroid_lat, cluster.centroid_lon)
    }
  }
  const { data: rep } = await supabase
    .from('on_scene_reports')
    .select('people_assisted, services, new_hazards')
    .eq('dispatch_id', d.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const hasReport = !!rep

  return NextResponse.json({
    dispatch: {
      id: d.id, status: d.status, note: d.note,
      location_name: place, hazard, map_link: link,
      title, severity, description, // populated for custom incidents
      has_report: hasReport, report: rep ?? null,
    },
  })
}
