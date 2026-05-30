import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

// Members of one team. Reads/writes are gated on the team belonging to the
// caller's org (checked via the team's org_id).

async function teamInOrg(supabase: ReturnType<typeof createServiceClient>, teamId: string, orgId: string) {
  const { data } = await supabase.from('ngo_teams').select('id').eq('id', teamId).eq('org_id', orgId).maybeSingle()
  return !!data
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params

  const supabase = createServiceClient()
  if (!(await teamInOrg(supabase, id, session!.orgId))) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('team_members')
    .select('id, name, role, phone, emergency_contact, ngo_user_id, created_at')
    .eq('team_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Could not load members' }, { status: 500 })
  return NextResponse.json({ members: data ?? [] })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params

  let body: { name?: string; role?: string; phone?: string; emergency_contact?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Member name is required' }, { status: 400 })

  const supabase = createServiceClient()
  if (!(await teamInOrg(supabase, id, session!.orgId))) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('team_members')
    .insert({
      team_id: id,
      name,
      role: body.role ? String(body.role).trim() : null,
      phone: body.phone ? String(body.phone).trim() : null,
      emergency_contact: body.emergency_contact ? String(body.emergency_contact).trim() : null,
    })
    .select('id, name, role, phone, emergency_contact, ngo_user_id')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Could not add member' }, { status: 500 })
  return NextResponse.json({ member: data })
}
