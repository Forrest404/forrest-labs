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

  let body: { lat?: number; lon?: number; note?: string; client_token?: string } = {}
  try { body = await request.json() } catch { /* GPS-less check-in is allowed */ }

  // Range-guard coordinates (M5): a GPS-less check-in is allowed, but an out-of-range
  // value is stored as null rather than persisted as junk.
  const lat = (typeof body.lat === 'number' && body.lat >= -90 && body.lat <= 90) ? body.lat : null
  const lon = (typeof body.lon === 'number' && body.lon >= -180 && body.lon <= 180) ? body.lon : null
  const token = typeof body.client_token === 'string' ? body.client_token.slice(0, 80) : null
  const now = new Date().toISOString()

  const supabase = createServiceClient()
  const teamId = await resolveTeamId(supabase, session!.userId)

  // Idempotent re-flush: if this exact queued check-in already landed (same client_token),
  // don't write a duplicate row. (try/catch tolerates the column not existing pre-migration.)
  if (token) {
    try {
      const { data: dup } = await supabase.from('check_ins').select('id').eq('client_token', token).limit(1).maybeSingle()
      if (dup) return NextResponse.json({ success: true, deduped: true, at: now })
    } catch { /* column missing pre-migration — fall through to insert */ }
  }

  const row: Record<string, unknown> = {
    ngo_user_id: session!.userId,
    team_id: teamId,
    lat, lon,
    status: 'safe',
    note: body.note ? String(body.note).slice(0, 500) : null,
    synced_at: now,
  }
  if (token) row.client_token = token
  let { error } = await supabase.from('check_ins').insert(row)
  // Pre-migration fallback: client_token column not there yet → insert without it.
  if (error && (error.code === '42703' || error.code === 'PGRST204')) {
    delete row.client_token
    ;({ error } = await supabase.from('check_ins').insert(row))
  }
  // Race backstop: a concurrent flush already inserted this token.
  if (error && error.code === '23505') return NextResponse.json({ success: true, deduped: true, at: now })
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
