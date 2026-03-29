import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

const VALID_STATUSES = ['acknowledged', 'en_route', 'on_scene', 'completed', 'cancelled']

const TIMESTAMP_FIELD: Record<string, string> = {
  acknowledged: 'acknowledged_at',
  on_scene: 'arrived_at',
  completed: 'completed_at',
  cancelled: 'cancelled_at',
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { id } = await params

  let body: { status?: string; notes?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { status, notes } = body

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: dispatch } = await supabase.from('dispatches').select('id, team_id, status').eq('id', id).single()

  if (!dispatch) {
    return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
  }

  const updatePayload: Record<string, unknown> = { status }
  if (TIMESTAMP_FIELD[status]) {
    updatePayload[TIMESTAMP_FIELD[status]] = new Date().toISOString()
  }
  if (notes) updatePayload.notes = notes

  const { error } = await supabase.from('dispatches').update(updatePayload).eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  // Return team to standby on completion or cancellation
  if (status === 'completed' || status === 'cancelled') {
    await supabase
      .from('teams')
      .update({ status: 'standby', updated_at: new Date().toISOString() })
      .eq('id', dispatch.team_id)
  }

  return NextResponse.json({ success: true })
}
