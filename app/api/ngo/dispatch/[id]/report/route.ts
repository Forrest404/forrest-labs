import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession } from '@/lib/ngo-auth'
import { resolveTeamId } from '@/lib/ngo-safety'

// On-scene report — three fields only: people_assisted, services, new_hazards.
// Filed (POST) and corrected (PUT) by the field coordinator on the team or a leader/admin.

// Auth + org/team scope shared by POST and PUT. Returns the dispatch or a NextResponse error.
async function authorise(request: NextRequest, id: string, supabase: ReturnType<typeof createServiceClient>) {
  const session = await getNgoSession(request)
  if (!session) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  const { data: d } = await supabase.from('ngo_dispatches').select('id, org_id, team_id').eq('id', id).eq('org_id', session.orgId).maybeSingle()
  if (!d) return { error: NextResponse.json({ error: 'Dispatch not found' }, { status: 404 }) }
  const isLeader = session.role === 'org_admin' || session.role === 'team_leader'
  if (!isLeader) {
    if (session.role !== 'field_coordinator') return { error: NextResponse.json({ error: 'Not authorised' }, { status: 403 }) }
    const myTeam = await resolveTeamId(supabase, session.userId)
    if (myTeam !== d.team_id) return { error: NextResponse.json({ error: 'Not your dispatch' }, { status: 403 }) }
  }
  return { dispatch: d }
}

function parseReport(body: { people_assisted?: unknown; services?: string; new_hazards?: string }) {
  const peopleRaw = body.people_assisted
  const people = peopleRaw === undefined || peopleRaw === null || peopleRaw === '' ? null : Number(peopleRaw)
  if (people !== null && (!Number.isFinite(people) || people < 0)) return null
  return {
    people_assisted: people,
    services: body.services ? String(body.services).slice(0, 1000) : null,
    new_hazards: body.new_hazards ? String(body.new_hazards).slice(0, 1000) : null,
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const auth = await authorise(request, id, supabase)
  if (auth.error) return auth.error

  let body = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const fields = parseReport(body)
  if (!fields) return NextResponse.json({ error: 'people_assisted must be a non-negative number' }, { status: 400 })

  const { error } = await supabase.from('on_scene_reports').insert({ dispatch_id: id, ...fields })
  if (error) return NextResponse.json({ error: 'Could not save report' }, { status: 500 })
  return NextResponse.json({ success: true })
}

// Correct an existing report (edit in place). Updates the dispatch's latest report.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const auth = await authorise(request, id, supabase)
  if (auth.error) return auth.error

  let body = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const fields = parseReport(body)
  if (!fields) return NextResponse.json({ error: 'people_assisted must be a non-negative number' }, { status: 400 })

  const { data: existing } = await supabase
    .from('on_scene_reports').select('id').eq('dispatch_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!existing) {
    // Nothing to edit yet — create it.
    const { error } = await supabase.from('on_scene_reports').insert({ dispatch_id: id, ...fields })
    if (error) return NextResponse.json({ error: 'Could not save report' }, { status: 500 })
    return NextResponse.json({ success: true, created: true })
  }
  const { error } = await supabase.from('on_scene_reports').update(fields).eq('id', existing.id)
  if (error) return NextResponse.json({ error: 'Could not update report' }, { status: 500 })
  return NextResponse.json({ success: true })
}
