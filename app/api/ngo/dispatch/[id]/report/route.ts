import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession } from '@/lib/ngo-auth'
import { resolveTeamId } from '@/lib/ngo-safety'

// On-scene report — three fields only: people_assisted, services, new_hazards.
// Filed by the field coordinator on the team (or a leader/admin).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params

  let body: { people_assisted?: unknown; services?: string; new_hazards?: string } = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const supabase = createServiceClient()
  const { data: d } = await supabase.from('ngo_dispatches').select('id, org_id, team_id').eq('id', id).maybeSingle()
  if (!d || d.org_id !== session.orgId) return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })

  const isLeader = session.role === 'org_admin' || session.role === 'team_leader'
  if (!isLeader) {
    if (session.role !== 'field_coordinator') return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
    const myTeam = await resolveTeamId(supabase, session.userId)
    if (myTeam !== d.team_id) return NextResponse.json({ error: 'Not your dispatch' }, { status: 403 })
  }

  const peopleRaw = body.people_assisted
  const people = peopleRaw === undefined || peopleRaw === null || peopleRaw === '' ? null : Number(peopleRaw)
  if (people !== null && (!Number.isFinite(people) || people < 0)) {
    return NextResponse.json({ error: 'people_assisted must be a non-negative number' }, { status: 400 })
  }

  const { error } = await supabase.from('on_scene_reports').insert({
    dispatch_id: id,
    people_assisted: people,
    services: body.services ? String(body.services).slice(0, 1000) : null,
    new_hazards: body.new_hazards ? String(body.new_hazards).slice(0, 1000) : null,
  })
  if (error) return NextResponse.json({ error: 'Could not save report' }, { status: 500 })
  return NextResponse.json({ success: true })
}
