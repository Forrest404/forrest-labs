import { NextRequest, NextResponse } from 'next/server'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { forwardGeocode } from '@/lib/ngo-dispatch'

// Resolve a typed address → coordinates for the "new incident" form. Auth-gated so
// the Mapbox token stays server-side.
export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const q = new URL(request.url).searchParams.get('q') ?? ''
  if (!q.trim()) return NextResponse.json({ error: 'q required' }, { status: 400 })
  const hit = await forwardGeocode(q)
  if (!hit) return NextResponse.json({ result: null })
  return NextResponse.json({ result: hit })
}
