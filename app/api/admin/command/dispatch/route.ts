import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'
import { writeAuditLog } from '@/lib/admin/audit'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: { team_id?: string; cluster_id?: string; notes?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { team_id, cluster_id, notes } = body

  if (!team_id || !UUID_RE.test(team_id)) {
    return NextResponse.json({ error: 'Valid team_id required' }, { status: 400 })
  }
  if (!cluster_id || !UUID_RE.test(cluster_id)) {
    return NextResponse.json({ error: 'Valid cluster_id required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: team } = await supabase.from('teams').select('id, status, name').eq('id', team_id).single()

  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  if ((team.status as string) !== 'standby') {
    return NextResponse.json({ error: 'Team is not available for dispatch' }, { status: 409 })
  }

  const { data: dispatch, error: insertErr } = await supabase
    .from('dispatches')
    .insert({
      team_id,
      cluster_id,
      assigned_by: 'founder',
      status: 'assigned',
      notes: notes ?? null,
    })
    .select('id')
    .single()

  if (insertErr || !dispatch) {
    console.error('[dispatch]', insertErr?.message)
    return NextResponse.json({ error: 'Dispatch failed' }, { status: 500 })
  }

  await supabase.from('teams').update({ status: 'deployed', updated_at: new Date().toISOString() }).eq('id', team_id)

  await writeAuditLog({
    action: 'team_dispatched',
    entityType: 'dispatch',
    entityId: dispatch.id as string,
    sessionId: session.sessionId,
    notes: `Team ${team.name} dispatched to cluster ${cluster_id}`,
  })

  return NextResponse.json({ success: true, dispatch_id: dispatch.id })
}
