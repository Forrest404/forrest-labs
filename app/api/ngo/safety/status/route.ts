import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { resolveTeamId } from '@/lib/ngo-safety'

const SETTABLE = ['standby', 'deployed', 'unavailable']

// Field coordinator sets their team's operational status.
export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['field_coordinator'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  let body: { status?: string } = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const status = String(body.status ?? '')
  if (!SETTABLE.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const supabase = createServiceClient()
  const teamId = await resolveTeamId(supabase, session!.userId)
  if (!teamId) return NextResponse.json({ error: 'You are not assigned to a team' }, { status: 400 })

  const { data: existing } = await supabase.from('team_status').select('last_lat, last_lon, last_seen_at').eq('team_id', teamId).maybeSingle()
  const { error } = await supabase.from('team_status').upsert({
    team_id: teamId,
    status,
    last_lat: existing?.last_lat ?? null,
    last_lon: existing?.last_lon ?? null,
    last_seen_at: existing?.last_seen_at ?? null,
  })
  if (error) return NextResponse.json({ error: 'Could not update status' }, { status: 500 })
  return NextResponse.json({ success: true, status })
}
