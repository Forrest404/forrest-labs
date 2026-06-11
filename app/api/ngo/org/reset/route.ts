import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

// POST — "Wipe teams & members" from the settings Danger zone (org_admin only). Removes ALL of
// the org's teams (cascades team_members, team_status, team-scoped chat links) and ALL non-admin
// accounts (team_leader + field_coordinator, cascading their check-ins / panics / roll-call
// responses). The organisation, its org_admins, and incident/dispatch history are KEPT
// (dispatch.team_id is set null when its team is removed). Civilian data is untouched. Requires
// typing the exact org name to confirm.
export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  let body: { confirm_name?: string }
  try { body = await request.json() } catch { body = {} }

  const supabase = createServiceClient()
  const orgId = session!.orgId
  const { data: org } = await supabase.from('ngo_organisations').select('id, name').eq('id', orgId).maybeSingle()
  if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })
  if (String(body.confirm_name ?? '').trim() !== String(org.name).trim()) {
    return NextResponse.json({ error: 'Type the exact organisation name to confirm.' }, { status: 400 })
  }

  // Teams first (cascades team_members / team_status), then the non-admin accounts.
  const { data: teams, error: teamErr } = await supabase
    .from('ngo_teams').delete().eq('org_id', orgId).select('id')
  if (teamErr) return NextResponse.json({ error: 'Could not wipe teams' }, { status: 500 })

  const { data: users, error: userErr } = await supabase
    .from('ngo_users').delete().eq('org_id', orgId).in('role', ['team_leader', 'field_coordinator']).select('id')
  if (userErr) return NextResponse.json({ error: 'Teams removed, but member accounts could not be removed' }, { status: 500 })

  return NextResponse.json({ success: true, teams_deleted: teams?.length ?? 0, users_deleted: users?.length ?? 0 })
}
