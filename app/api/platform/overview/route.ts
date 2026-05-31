import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

// Platform-operator overview: at-a-glance platform totals + the "needs attention"
// list (pending orgs). Admin-gated (fl_admin_session). Counts via head:true so we
// never pull rows; pending list is small by nature.
export async function GET(request: NextRequest) {
  const admin = await getSessionFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })

  const supabase = createServiceClient()
  try {
    const [
      { count: approved },
      { count: pending },
      { count: suspended },
      { count: totalUsers },
      { count: activeTeams },
      { data: pendingOrgs },
    ] = await Promise.all([
      supabase.from('ngo_organisations').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('ngo_organisations').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('ngo_organisations').select('*', { count: 'exact', head: true }).eq('status', 'suspended'),
      supabase.from('ngo_users').select('*', { count: 'exact', head: true }),
      supabase.from('team_status').select('*', { count: 'exact', head: true }).in('status', ['standby', 'deployed']),
      supabase
        .from('ngo_organisations')
        .select('id, name, type, country, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(20),
    ])

    return NextResponse.json(
      {
        orgs: { approved: approved ?? 0, pending: pending ?? 0, suspended: suspended ?? 0, total: (approved ?? 0) + (pending ?? 0) + (suspended ?? 0) },
        total_users: totalUsers ?? 0,
        active_teams: activeTeams ?? 0,
        pending_orgs: pendingOrgs ?? [],
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    console.error('platform overview failed:', e)
    return NextResponse.json({ error: 'Could not load overview' }, { status: 500 })
  }
}
