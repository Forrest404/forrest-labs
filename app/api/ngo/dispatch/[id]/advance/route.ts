import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession } from '@/lib/ngo-auth'
import { resolveTeamId } from '@/lib/ngo-safety'
import { DISPATCH_FLOW } from '@/lib/ngo-dispatch'

const STAMP: Record<string, string> = { en_route: 'en_route_at', on_scene: 'on_scene_at', done: 'done_at' }

// Advance a dispatch one step along assigned → en_route → on_scene → done.
// The field coordinator on the team advances it; a leader/admin may too.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  const supabase = createServiceClient()

  const { data: d } = await supabase
    .from('ngo_dispatches').select('id, org_id, team_id, status').eq('id', id).maybeSingle()
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

  const { error } = await supabase.from('ngo_dispatches').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: 'Could not advance dispatch' }, { status: 500 })
  return NextResponse.json({ success: true, status: next })
}
