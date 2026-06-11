import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession } from '@/lib/ngo-auth'
import { resolveTeamId } from '@/lib/ngo-safety'
import { DISPATCH_FLOW } from '@/lib/ngo-dispatch'
import { notifyOrgRoles } from '@/lib/ngo-notify'

const ADVANCE_LABEL: Record<string, string> = { en_route: 'is en route', on_scene: 'is on scene', done: 'completed the dispatch' }

const STAMP: Record<string, string> = { en_route: 'en_route_at', on_scene: 'on_scene_at', done: 'done_at' }

// Advance a dispatch one step along assigned → en_route → on_scene → done.
// The field coordinator on the team advances it; a leader/admin may too.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  const supabase = createServiceClient()

  const { data: d } = await supabase
    .from('ngo_dispatches').select('id, org_id, team_id, status, cluster_id, ngo_incident_id').eq('id', id).eq('org_id', session.orgId).maybeSingle()
  if (!d || d.org_id !== session.orgId) return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })

  // Authorise: leader/admin, or the field coordinator assigned to this team.
  const isLeader = session.role === 'org_admin' || session.role === 'team_leader'
  if (!isLeader) {
    if (session.role !== 'field_coordinator') return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
    const myTeam = await resolveTeamId(supabase, session.userId)
    if (myTeam !== d.team_id) return NextResponse.json({ error: 'Not your dispatch' }, { status: 403 })
  }

  const idx = DISPATCH_FLOW.indexOf(d.status as any)
  if (idx < 0) return NextResponse.json({ error: 'Dispatch is not active' }, { status: 400 })
  const next = DISPATCH_FLOW[idx + 1]
  if (!next) return NextResponse.json({ error: 'Already complete' }, { status: 400 })

  const update: Record<string, any> = { status: next }
  if (STAMP[next]) update[STAMP[next]] = new Date().toISOString()

  // Optimistic concurrency (audit H2): only advance if the status is still what we read.
  // Two concurrent advances then can't both fire the 'done' side-effects / notifications —
  // exactly one update matches, the other affects zero rows and returns without side-effects.
  const { data: updated, error } = await supabase
    .from('ngo_dispatches').update(update).eq('id', id).eq('status', d.status).select('id')
  if (error) return NextResponse.json({ error: 'Could not advance dispatch' }, { status: 500 })
  if (!updated || updated.length === 0) {
    return NextResponse.json({ success: true, status: next, already: true })
  }

  // The team went through every step → the incident is dealt with. Auto-mark it
  // complete (best-effort; never fails the advance). A custom incident is resolved;
  // a public cluster gets a 'completed' row in the NGO-owned overlay (clusters are
  // read-only). The org can reopen either from the board.
  if (next === 'done') {
    const now = new Date().toISOString()
    try {
      if (d.ngo_incident_id) {
        await supabase.from('ngo_incidents')
          .update({ status: 'resolved', resolved_at: now, resolved_by: session.userId })
          .eq('id', d.ngo_incident_id).eq('org_id', session.orgId)
      } else if (d.cluster_id) {
        await supabase.from('ngo_cluster_status')
          .upsert({ org_id: session.orgId, cluster_id: d.cluster_id, status: 'completed', updated_by: session.userId, updated_at: now },
                  { onConflict: 'org_id,cluster_id' })
      }
    } catch { /* overlay/table may be pre-migration; advancing still succeeded */ }
  }

  // Field → HQ: tell leaders the team advanced (normal urgency → honours their prefs /
  // quiet-hours, and reaches only leaders on their own topics). Best-effort; never fails
  // the advance.
  try {
    const { data: team } = await supabase.from('ngo_teams').select('name').eq('id', d.team_id).maybeSingle()
    await notifyOrgRoles(supabase, session.orgId, ['org_admin', 'team_leader'], {
      event: 'dispatch_update',
      title: 'Dispatch update',
      body: `${team?.name ?? 'A team'} ${ADVANCE_LABEL[next] ?? `→ ${next}`}.`,
    })
  } catch { /* notification is best-effort */ }

  return NextResponse.json({ success: true, status: next })
}
