import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { TEAM_TYPES } from '../route'

// Edit / delete a single team. Every operation re-confirms the team belongs to
// the caller's org before touching it, so a team id from another org 404s.

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params

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
  // Scope check: update only when org_id matches; .select() tells us if a row hit.
  const { data, error } = await supabase
    .from('ngo_teams')
    .update({ name, type, capacity })
    .eq('id', id)
    .eq('org_id', session!.orgId)
    .select('id, name, type, capacity')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Could not update team' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  return NextResponse.json({ team: data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  // Only org_admin may delete a team.
  if (!requireRole(session, ['org_admin'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('ngo_teams')
    .delete()
    .eq('id', id)
    .eq('org_id', session!.orgId)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Could not delete team' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
