import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { resolveTeamId } from '@/lib/ngo-safety'

// Field coordinator taps "I'm safe" for a roll call. Idempotent on the response. If
// GPS is shared, it also records the coordinator's location (a check_in) so their
// live pin updates on the board.
export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['field_coordinator'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  let body: { roll_call_id?: string; lat?: number; lon?: number } = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const rollCallId = String(body.roll_call_id ?? '')
  if (!rollCallId) return NextResponse.json({ error: 'roll_call_id required' }, { status: 400 })
  const lat = typeof body.lat === 'number' ? body.lat : null
  const lon = typeof body.lon === 'number' ? body.lon : null

  const supabase = createServiceClient()

  // Roll call must belong to the caller's org.
  const { data: rc } = await supabase.from('roll_calls').select('org_id').eq('id', rollCallId).maybeSingle()
  if (!rc || rc.org_id !== session!.orgId) return NextResponse.json({ error: 'Roll call not found' }, { status: 404 })

  // Share location (if given): record it as a check-in + refresh team_status, so the
  // worker's last-known pin updates. Done even on a repeat tap.
  if (lat != null && lon != null) {
    const teamId = await resolveTeamId(supabase, session!.userId)
    const now = new Date().toISOString()
    await supabase.from('check_ins').insert({ ngo_user_id: session!.userId, team_id: teamId, lat, lon, status: 'roll_call', synced_at: now })
    if (teamId) {
      const { data: ts } = await supabase.from('team_status').select('status').eq('team_id', teamId).maybeSingle()
      await supabase.from('team_status').upsert({ team_id: teamId, status: ts?.status ?? 'standby', last_lat: lat, last_lon: lon, last_seen_at: now })
    }
  }

  const { data: existing } = await supabase
    .from('roll_call_responses')
    .select('id')
    .eq('roll_call_id', rollCallId)
    .eq('ngo_user_id', session!.userId)
    .maybeSingle()
  if (existing) return NextResponse.json({ success: true, already: true })

  const { error } = await supabase.from('roll_call_responses').insert({
    roll_call_id: rollCallId,
    ngo_user_id: session!.userId,
    safe: true,
    responded_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ error: 'Could not record response' }, { status: 500 })
  return NextResponse.json({ success: true })
}
