import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

// POST /api/ngo/org/purge — org_admin "Purge now". Immediately hard-deletes this org's
// location data past the retention window (the same set-based function the scheduled
// pg_cron job runs nightly). Session-gated to org_admin; org-scoped via p_org so an
// admin can only purge their OWN org. Returns counts only — never coordinates.
export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('purge_ngo_location', { p_org: session!.orgId })
  if (error) {
    console.error('purge_ngo_location failed') // no org/coords in the log
    return NextResponse.json({ error: 'Purge failed' }, { status: 500 })
  }

  // rpc returns one row for this org (or none if nothing matched).
  const row = Array.isArray(data) ? data[0] : data
  return NextResponse.json({
    success: true,
    check_ins_deleted: row?.check_ins_deleted ?? 0,
    panics_deleted: row?.panics_deleted ?? 0,
    roll_calls_deleted: row?.roll_calls_deleted ?? 0,
    team_positions_cleared: row?.team_positions_cleared ?? 0,
  })
}
