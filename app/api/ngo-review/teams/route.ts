import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

// NOUR-internal: every team across ALL organisations (admin-gated, cross-org).
export const TEAM_TYPES = ['medical', 'rescue', 'assessment', 'shelter', 'logistics']

export async function GET(request: NextRequest) {
  const admin = await getSessionFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('ngo_teams')
    .select('id, name, type, capacity, created_at, ngo_organisations ( id, name, status ), team_status ( status, last_seen_at ), team_members ( count )')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('admin all-teams load failed:', error)
    return NextResponse.json({ error: 'Could not load teams' }, { status: 500 })
  }

  const teams = (data ?? []).map((t: any) => {
    const org = Array.isArray(t.ngo_organisations) ? t.ngo_organisations[0] : t.ngo_organisations
    const status = Array.isArray(t.team_status) ? t.team_status[0] : t.team_status
    const count = Array.isArray(t.team_members) ? t.team_members[0]?.count ?? 0 : t.team_members?.count ?? 0
    return {
      id: t.id,
      name: t.name,
      type: t.type,
      capacity: t.capacity,
      status: status?.status ?? 'offline',
      last_seen_at: status?.last_seen_at ?? null,
      org_id: org?.id ?? null,
      org_name: org?.name ?? 'Unknown org',
      org_status: org?.status ?? null,
      member_count: count,
    }
  })
  // Group by organisation name for the UI.
  teams.sort((a, b) => a.org_name.localeCompare(b.org_name))
  return NextResponse.json({ teams })
}
