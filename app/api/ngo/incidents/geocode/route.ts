import { NextRequest, NextResponse } from 'next/server'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { forwardGeocode } from '@/lib/ngo-dispatch'
import { createServiceClient } from '@/lib/supabase/service'

// Resolve a typed address → coordinates for the "new incident" form. Auth-gated so
// the Mapbox token stays server-side. Worldwide search, biased towards the org's
// base location when one is set (so "Main Street" resolves near THEIR city).
export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const q = new URL(request.url).searchParams.get('q') ?? ''
  if (!q.trim()) return NextResponse.json({ error: 'q required' }, { status: 400 })

  // Org base as the proximity bias (pre-migration safe: error → no bias).
  let bias: { lat: number; lon: number } | null = null
  try {
    const supabase = createServiceClient()
    const { data: org } = await supabase
      .from('ngo_organisations').select('base_lat, base_lon').eq('id', session!.orgId).maybeSingle()
    if (org && org.base_lat != null && org.base_lon != null) bias = { lat: org.base_lat, lon: org.base_lon }
  } catch { /* column absent pre-migration — unbiased worldwide search */ }

  const hit = await forwardGeocode(q, bias)
  if (!hit) return NextResponse.json({ result: null })
  return NextResponse.json({ result: hit })
}
