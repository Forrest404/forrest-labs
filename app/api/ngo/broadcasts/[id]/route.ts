import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

// GET /api/ngo/broadcasts/[id] — recipient roster for a broadcast (leaders/admins), so the
// sender can see who has and hasn't acknowledged (roll-call style). Org-scoped.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params
  const supabase = createServiceClient()

  const { data: bcast } = await supabase
    .from('broadcasts').select('id, urgency').eq('id', id).eq('org_id', session!.orgId).maybeSingle()
  if (!bcast) return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })

  const { data: recs } = await supabase
    .from('broadcast_recipients')
    .select('delivered_at, acknowledged_at, ngo_users ( full_name )')
    .eq('broadcast_id', id)
    .eq('org_id', session!.orgId)

  const recipients = (recs ?? []).map((r: any) => {
    const u = Array.isArray(r.ngo_users) ? r.ngo_users[0] : r.ngo_users
    return { name: u?.full_name ?? 'Unknown', delivered: !!r.delivered_at, acknowledged: !!r.acknowledged_at }
  }).sort((a: any, b: any) => a.name.localeCompare(b.name))

  return NextResponse.json({ urgency: bcast.urgency, recipients }, { headers: { 'Cache-Control': 'no-store' } })
}
