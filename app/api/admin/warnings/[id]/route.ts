import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAuditLog } from '@/lib/admin/audit'

// PATCH /api/admin/warnings/[id] — admin manage of a warning cluster: mark it all-clear or
// discard it (a false/duplicate warning). Admin-only (session checked here + middleware).
const ALLOWED = new Set(['all_clear', 'discarded', 'active'])

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  let body: { status?: string } = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const status = String(body.status ?? '')
  if (!ALLOWED.has(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: warning, error: fetchErr } = await supabase
    .from('warning_clusters').select('status').eq('id', id).single()
  if (fetchErr || !warning) return NextResponse.json({ error: 'Warning not found' }, { status: 404 })

  const { error: updateErr } = await supabase
    .from('warning_clusters')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (updateErr) return NextResponse.json({ error: 'Could not update warning' }, { status: 500 })

  await writeAuditLog({
    action: status === 'discarded' ? 'warning_discarded' : status === 'all_clear' ? 'warning_all_clear' : 'warning_updated',
    entityType: 'warning_cluster',
    entityId: id,
    oldValue: { status: warning.status },
    newValue: { status },
    sessionId: session.sessionId,
    notes: 'Updated via admin panel',
  })

  return NextResponse.json({ success: true, id, status })
}
