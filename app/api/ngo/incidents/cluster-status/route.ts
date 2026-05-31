import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

// NGO handling state for a PUBLIC cluster (read-only to NGOs, so the state lives in
// the org-owned ngo_cluster_status overlay). Leaders/admins only.
//   action 'dismiss'  → row status 'dismissed' (not actionable for this org)
//   action 'complete' → row status 'completed' (dealt with, without a full dispatch)
//   action 'reopen'   → delete the row (incident returns to the active board)
export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  let body: { cluster_id?: string; action?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const clusterId = String(body.cluster_id ?? '').trim()
  const action = String(body.action ?? '')
  if (!clusterId) return NextResponse.json({ error: 'cluster_id is required' }, { status: 400 })
  if (!['dismiss', 'complete', 'reopen'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const supabase = createServiceClient()

  if (action === 'reopen') {
    const { error } = await supabase
      .from('ngo_cluster_status').delete().eq('org_id', session!.orgId).eq('cluster_id', clusterId)
    if (error) return NextResponse.json({ error: 'Could not reopen incident' }, { status: 500 })
    return NextResponse.json({ success: true, handling: 'active' })
  }

  const status = action === 'dismiss' ? 'dismissed' : 'completed'
  const { error } = await supabase
    .from('ngo_cluster_status')
    .upsert({ org_id: session!.orgId, cluster_id: clusterId, status, updated_by: session!.userId, updated_at: new Date().toISOString() },
            { onConflict: 'org_id,cluster_id' })
  if (error) return NextResponse.json({ error: 'Could not update incident' }, { status: 500 })
  return NextResponse.json({ success: true, handling: status })
}
