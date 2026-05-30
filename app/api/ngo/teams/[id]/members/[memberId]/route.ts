import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { revokeOrphanedMemberLogin } from '@/lib/ngo-safety'

// Edit / remove a roster member. Scoped to the caller's org via the parent team.

async function teamInOrg(supabase: ReturnType<typeof createServiceClient>, teamId: string, orgId: string) {
  const { data } = await supabase.from('ngo_teams').select('id').eq('id', teamId).eq('org_id', orgId).maybeSingle()
  return !!data
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id, memberId } = await params

  let body: { name?: string; role?: string; phone?: string; emergency_contact?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Member name is required' }, { status: 400 })

  const supabase = createServiceClient()
  if (!(await teamInOrg(supabase, id, session!.orgId))) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('team_members')
    .update({
      name,
      role: body.role ? String(body.role).trim() : null,
      phone: body.phone ? String(body.phone).trim() : null,
      emergency_contact: body.emergency_contact ? String(body.emergency_contact).trim() : null,
    })
    .eq('id', memberId)
    .eq('team_id', id)
    .select('id, name, role, phone, emergency_contact, ngo_user_id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not update member' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  return NextResponse.json({ member: data })
}

// Remove a roster member. If the member had a field-coordinator login and is now on
// no team, their login is deleted too — so removal actually revokes dashboard access.

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id, memberId } = await params

  const supabase = createServiceClient()
  const { data: team } = await supabase
    .from('ngo_teams')
    .select('id')
    .eq('id', id)
    .eq('org_id', session!.orgId)
    .maybeSingle()
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('team_members')
    .delete()
    .eq('id', memberId)
    .eq('team_id', id)
    .select('id, ngo_user_id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Could not remove member' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  const accessRevoked = await revokeOrphanedMemberLogin(supabase, data.ngo_user_id)
  return NextResponse.json({ success: true, access_revoked: accessRevoked })
}
