import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'
import { revokeOrphanedMemberLogin } from '@/lib/ngo-safety'
import { TEAM_TYPES } from '../route'

// NOUR-internal edit/delete of any team (cross-org, admin-gated).
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSessionFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  const { id } = await params

  let body: { name?: string; type?: string; capacity?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const name = String(body.name ?? '').trim()
  const type = String(body.type ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Team name is required' }, { status: 400 })
  if (!TEAM_TYPES.includes(type)) return NextResponse.json({ error: 'Invalid team type' }, { status: 400 })
  const capacity =
    body.capacity === undefined || body.capacity === null || body.capacity === '' ? null : Number(body.capacity)
  if (capacity !== null && (!Number.isFinite(capacity) || capacity < 0)) {
    return NextResponse.json({ error: 'Capacity must be a positive number' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('ngo_teams')
    .update({ name, type, capacity })
    .eq('id', id)
    .select('id, name, type, capacity')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not update team' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  return NextResponse.json({ team: data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSessionFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  const { id } = await params

  const supabase = createServiceClient()
  const { data: members } = await supabase.from('team_members').select('ngo_user_id').eq('team_id', id)

  const { data, error } = await supabase.from('ngo_teams').delete().eq('id', id).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not delete team' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  let revoked = 0
  for (const m of members ?? []) {
    if (await revokeOrphanedMemberLogin(supabase, m.ngo_user_id)) revoked++
  }
  return NextResponse.json({ success: true, logins_revoked: revoked })
}
