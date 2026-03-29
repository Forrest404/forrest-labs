import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPartnerSession } from '@/lib/admin/auth'

export async function GET(request: NextRequest) {
  const session = await getPartnerSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const [
    { data: org },
    { data: teams },
    { data: resources },
    { data: alerts },
  ] = await Promise.all([
    supabase
      .from('organisations')
      .select('id, name, type')
      .eq('id', session.organisationId)
      .single(),
    supabase
      .from('teams')
      .select('id, name, team_type, status, current_location, capacity')
      .eq('organisation_id', session.organisationId)
      .eq('active', true)
      .order('name'),
    supabase
      .from('resources')
      .select('id, name, resource_type, quantity_total, quantity_available, unit, low_stock_threshold')
      .eq('organisation_id', session.organisationId)
      .order('name'),
    supabase
      .from('clusters')
      .select('id, status, confidence_score, report_count, location_name, centroid_lat, centroid_lon, created_at')
      .in('status', ['confirmed', 'auto_confirmed', 'news_verified', 'official_verified'])
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return NextResponse.json({
    organisation: org
      ? { id: org.id, name: org.name, org_type: org.type }
      : null,
    teams: teams ?? [],
    resources: resources ?? [],
    recent_alerts: alerts ?? [],
  })
}
