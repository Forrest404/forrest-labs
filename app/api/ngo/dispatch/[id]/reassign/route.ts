import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { notifyTeam } from '@/lib/ngo-notify'

// Move a team to a different incident: repoint the dispatch, reset to 'assigned'
// and clear progression timestamps, record the reason, and notify the team.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params

  let body: { cluster_id?: string; reason?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const clusterId = String(body.cluster_id ?? '')
  if (!clusterId) return NextResponse.json({ error: 'cluster_id required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: d } = await supabase.from('ngo_dispatches').select('id, org_id, team_id, note').eq('id', id).eq('org_id', session!.orgId).maybeSingle()
  if (!d || d.org_id !== session!.orgId) return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })

  // Validate the target cluster exists — coordinates are NOT relayed (security C1).
  const { data: cluster } = await supabase
    .from('clusters').select('id').eq('id', clusterId).maybeSingle()
  if (!cluster) return NextResponse.json({ error: 'Incident not found' }, { status: 404 })

  const reason = body.reason ? String(body.reason).slice(0, 300) : null
  const note = [d.note, reason ? `Reassigned: ${reason}` : 'Reassigned'].filter(Boolean).join(' · ')

  const { error } = await supabase.from('ngo_dispatches').update({
    cluster_id: clusterId,
    status: 'assigned',
    assigned_by: session!.userId,
    assigned_at: new Date().toISOString(),
    en_route_at: null,
    on_scene_at: null,
    done_at: null,
    note,
  }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Could not reassign' }, { status: 500 })

  // Sanitised broadcast (security C1): no hazard/place/coords/map link on the relay;
  // the team opens NOUR (authenticated) to see the new incident location.
  await notifyTeam(supabase, d.team_id, {
    title: '🔄 Reassigned',
    body: 'You have been reassigned to a new incident. Open NOUR for the location.',
    priority: 'urgent', tags: 'arrows_counterclockwise',
  }, { respectPrefs: true })

  return NextResponse.json({ success: true })
}
