import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { resolveTeamId } from '@/lib/ngo-safety'

// Proof-of-life check-in. Writes a check_ins row and refreshes the coordinator's
// team_status location/last-seen. GPS is optional (manual fallback on the client).
export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['field_coordinator'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  let body: { lat?: number; lon?: number; note?: string } = {}
  try { body = await request.json() } catch { /* GPS-less check-in is allowed */ }

  const lat = typeof body.lat === 'number' ? body.lat : null
  const lon = typeof body.lon === 'number' ? body.lon : null
  const now = new Date().toISOString()

  const supabase = createServiceClient()
  const teamId = await resolveTeamId(supabase, session!.userId)

  const { error } = await supabase.from('check_ins').insert({
    ngo_user_id: session!.userId,
    team_id: teamId,
    lat, lon,
    status: 'safe',
    note: body.note ? String(body.note).slice(0, 500) : null,
    synced_at: now,
  })
  if (error) return NextResponse.json({ error: 'Could not record check-in' }, { status: 500 })

  // Refresh the team's location/last-seen (keep existing status).
  if (teamId && lat != null && lon != null) {
    const { data: existing } = await supabase.from('team_status').select('status').eq('team_id', teamId).maybeSingle()
    await supabase.from('team_status').upsert({
      team_id: teamId,
      status: existing?.status ?? 'standby',
      last_lat: lat,
      last_lon: lon,
      last_seen_at: now,
    })
  }

  return NextResponse.json({ success: true, at: now })
}
