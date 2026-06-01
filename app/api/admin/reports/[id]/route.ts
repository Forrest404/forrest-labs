import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAuditLog } from '@/lib/admin/audit'

// PATCH /api/admin/reports/[id] — admin manage of a raw civilian report: discard a
// bogus/spam report, or restore it to pending. Admin-only. (Requires the widened
// reports_status_check; see migration 20260617000000.)
const ALLOWED = new Set(['discarded', 'pending'])

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  let body: { status?: string } = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const status = String(body.status ?? '')
  if (!ALLOWED.has(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: report, error: fetchErr } = await supabase
    .from('reports').select('status').eq('id', id).single()
  if (fetchErr || !report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })

  const { error: updateErr } = await supabase.from('reports').update({ status }).eq('id', id)
  if (updateErr) {
    // Most likely the status CHECK hasn't been widened yet.
    return NextResponse.json({ error: 'Could not update report (is the migration applied?)' }, { status: 500 })
  }

  await writeAuditLog({
    action: status === 'discarded' ? 'report_discarded' : 'report_restored',
    entityType: 'report',
    entityId: id,
    oldValue: { status: report.status },
    newValue: { status },
    sessionId: session.sessionId,
    notes: 'Updated via admin panel',
  })

  return NextResponse.json({ success: true, id, status })
}
