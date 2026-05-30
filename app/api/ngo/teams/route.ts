import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

// Teams for the caller's organisation. All access scoped to session.orgId.
// ngo_teams.type is CHECK-constrained to this set.
export const TEAM_TYPES = ['medical', 'rescue', 'assessment', 'shelter', 'logistics'] as const

export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  const supabase = createServiceClient()
  // Pull teams + their status row; team_status defaults to 'offline' when absent.
  const { data: teams, error } = await supabase
    .from('ngo_teams')
    .select('id, name, type, capacity, created_at, team_status ( status, last_lat, last_lon, last_seen_at )')
    .eq('org_id', session!.orgId)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'Could not load teams' }, { status: 500 })
  }

  const shaped = (teams ?? []).map((t: any) => {
    const status = Array.isArray(t.team_status) ? t.team_status[0] : t.team_status
    return {
      id: t.id,
      name: t.name,
      type: t.type,
      capacity: t.capacity,
      status: status?.status ?? 'offline',
      last_lat: status?.last_lat ?? null,
      last_lon: status?.last_lon ?? null,
      last_seen_at: status?.last_seen_at ?? null,
    }
  })
  return NextResponse.json({ teams: shaped })
}

export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  let body: { name?: string; type?: string; capacity?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const name = String(body.name ?? '').trim()
  const type = String(body.type ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Team name is required' }, { status: 400 })
  if (!TEAM_TYPES.includes(type as any)) {
    return NextResponse.json({ error: 'Invalid team type' }, { status: 400 })
  }
  const capacity =
    body.capacity === undefined || body.capacity === null || body.capacity === ''
      ? null
      : Number(body.capacity)
  if (capacity !== null && (!Number.isFinite(capacity) || capacity < 0)) {
    return NextResponse.json({ error: 'Capacity must be a positive number' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: team, error } = await supabase
    .from('ngo_teams')
    .insert({ org_id: session!.orgId, name, type, capacity })
    .select('id, name, type, capacity')
    .single()

  if (error || !team) {
    return NextResponse.json({ error: 'Could not create team' }, { status: 500 })
  }

  // Seed a status row so the situation board always has one (defaults to offline).
  await supabase.from('team_status').insert({ team_id: team.id, status: 'offline' })

  return NextResponse.json({ team: { ...team, status: 'offline' } })
}
