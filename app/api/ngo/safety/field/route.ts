import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { resolveTeamId } from '@/lib/ngo-safety'

// State for the mobile field view: the coordinator's team + status, their last
// check-in, and any active roll call they have not yet answered.
export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['field_coordinator'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const userId = session!.userId

  // Check-in cadence so the field view can show "next due" (field coordinators can't
  // call /api/ngo/org). Resilient to the column being absent. Default 240 min.
  let checkinWindow = 240
  try {
    const { data: org } = await supabase
      .from('ngo_organisations').select('checkin_window_minutes').eq('id', session!.orgId).maybeSingle()
    if (org && (org as any).checkin_window_minutes != null) checkinWindow = (org as any).checkin_window_minutes
  } catch { /* column may be absent */ }

  const teamId = await resolveTeamId(supabase, userId)

  let team: any = null
  if (teamId) {
    const { data } = await supabase
      .from('ngo_teams')
      .select('id, name, type, team_status ( status, last_seen_at )')
      .eq('id', teamId)
      .maybeSingle()
    if (data) {
      const s = Array.isArray(data.team_status) ? data.team_status[0] : data.team_status
      team = { id: data.id, name: data.name, type: data.type, status: s?.status ?? 'offline', last_seen_at: s?.last_seen_at ?? null }
    }
  }

  const { data: lastCheckIn } = await supabase
    .from('check_ins')
    .select('created_at')
    .eq('ngo_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Active roll call = newest org roll_call in the last 60 min not yet answered by me.
  const since = new Date(Date.now() - 60 * 60000).toISOString()
  const { data: rc } = await supabase
    .from('roll_calls')
    .select('id, message, created_at')
    .eq('org_id', session!.orgId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let activeRollCall: any = null
  if (rc) {
    const { data: resp } = await supabase
      .from('roll_call_responses')
      .select('id')
      .eq('roll_call_id', rc.id)
      .eq('ngo_user_id', userId)
      .maybeSingle()
    activeRollCall = { id: rc.id, message: rc.message, created_at: rc.created_at, answered: !!resp }
  }

  return NextResponse.json({
    team,
    last_check_in: lastCheckIn?.created_at ?? null,
    active_roll_call: activeRollCall,
    checkin_window_minutes: checkinWindow,
  })
}
