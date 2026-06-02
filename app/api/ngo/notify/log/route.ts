import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

// GET /api/ngo/notify/log — recent delivery log for this org (org_admin). So a failed
// CRITICAL send is visible, not silent. Holds no message body or recipient address.
export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('notification_log')
    .select('id, event_type, urgency, channel, status, created_at')
    .eq('org_id', session!.orgId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    // Table not migrated yet → empty, not an error page.
    return NextResponse.json({ entries: [], available: false })
  }
  const entries = data ?? []
  const failed_critical = entries.filter((e: any) => (e.urgency === 'critical' || e.urgency === 'high') && e.status === 'failed').length
  return NextResponse.json({ entries, available: true, failed_critical }, { headers: { 'Cache-Control': 'no-store' } })
}
