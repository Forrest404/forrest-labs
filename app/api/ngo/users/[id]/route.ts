import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole, hashSecret, generateLoginCode, isValidPin, type NgoRole } from '@/lib/ngo-auth'

const ROLES: NgoRole[] = ['org_admin', 'team_leader', 'field_coordinator']

// Would this change leave the org with no active org_admin? (lockout guard)
async function wouldOrphanOrg(
  supabase: ReturnType<typeof createServiceClient>,
  orgId: string,
  target: { id: string; role: string; status: string },
  next: { role?: string; status?: string; deleting?: boolean },
): Promise<boolean> {
  const wasActiveAdmin = target.role === 'org_admin' && target.status === 'active'
  if (!wasActiveAdmin) return false
  const stillActiveAdmin = !next.deleting && (next.role ?? target.role) === 'org_admin' && (next.status ?? target.status) === 'active'
  if (stillActiveAdmin) return false
  // This user is leaving the active-org_admin set — make sure another remains.
  const { count } = await supabase
    .from('ngo_users')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId).eq('role', 'org_admin').eq('status', 'active').neq('id', target.id)
  return (count ?? 0) === 0
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params
  let body: { full_name?: string; phone?: string; role?: string; status?: string; password?: string; pin?: string; regenerate_code?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const supabase = createServiceClient()
  const { data: target } = await supabase
    .from('ngo_users').select('id, role, status, login_code').eq('id', id).eq('org_id', session!.orgId).maybeSingle()
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const update: Record<string, unknown> = {}
  if (body.full_name !== undefined) {
    const n = String(body.full_name).trim()
    if (!n) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    update.full_name = n
  }
  if (body.phone !== undefined) update.phone = body.phone ? String(body.phone).trim() : null
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role as NgoRole)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    update.role = body.role
  }
  if (body.status !== undefined) {
    if (!['active', 'suspended'].includes(String(body.status))) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    update.status = body.status
  }
  // Optional credential reset.
  if (body.pin) {
    if (!isValidPin(String(body.pin))) return NextResponse.json({ error: 'PIN must be 6 digits' }, { status: 400 })
    update.pin_hash = hashSecret(String(body.pin))
  }
  if (body.password) {
    if (String(body.password).length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    update.password_hash = hashSecret(String(body.password))
  }
  // Generate/rotate the field-operative access code on request, or when promoting an
  // account to field_coordinator that has none yet.
  const nextRole = (update.role as string) ?? target.role
  let newCode: string | null = null
  if (body.regenerate_code || (nextRole === 'field_coordinator' && !(target as any).login_code)) {
    if (nextRole !== 'field_coordinator') return NextResponse.json({ error: 'Access codes are for field coordinators' }, { status: 400 })
    newCode = generateLoginCode()
    update.login_code = newCode
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  if (await wouldOrphanOrg(supabase, session!.orgId, target as any, { role: update.role as string, status: update.status as string })) {
    return NextResponse.json({ error: 'This is the org’s only active admin — assign another admin first.' }, { status: 409 })
  }

  const { error } = await supabase.from('ngo_users').update(update).eq('id', id).eq('org_id', session!.orgId)
  if (error) {
    if ((error as any)?.code === '23505') return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    return NextResponse.json({ error: 'Could not update user' }, { status: 500 })
  }
  return NextResponse.json({ success: true, login_code: newCode })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params
  const supabase = createServiceClient()
  const { data: target } = await supabase
    .from('ngo_users').select('id, role, status').eq('id', id).eq('org_id', session!.orgId).maybeSingle()
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (await wouldOrphanOrg(supabase, session!.orgId, target as any, { deleting: true })) {
    return NextResponse.json({ error: 'This is the org’s only active admin — assign another admin first.' }, { status: 409 })
  }

  // Deleting the user cascades their check-ins / panics / roll-call responses; their
  // team_members link is set null. (See foundation migration FKs.)
  const { error } = await supabase.from('ngo_users').delete().eq('id', id).eq('org_id', session!.orgId)
  if (error) return NextResponse.json({ error: 'Could not remove user' }, { status: 500 })
  return NextResponse.json({ success: true })
}
