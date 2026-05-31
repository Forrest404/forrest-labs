import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

// GET /api/ngo/reports — list this org's saved situation reports (newest first).
// Reports/exports are for leaders + admins; field_coordinator is blocked here too.
export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('ngo_reports')
    .select('id, title, period_start, period_end, created_at, draft')
    .eq('org_id', session!.orgId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('ngo reports list failed:', error)
    return NextResponse.json({ error: 'Could not load reports' }, { status: 500 })
  }
  // Trim the draft to a flag so the list stays light; full draft is fetched per-id.
  const reports = (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    period_start: r.period_start,
    period_end: r.period_end,
    created_at: r.created_at,
    has_draft: !!r.draft,
  }))
  return NextResponse.json({ reports }, { headers: { 'Cache-Control': 'no-store' } })
}
