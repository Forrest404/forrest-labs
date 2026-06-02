import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

// One organisation's profile for the Manage NGOs detail view: org fields, its
// users (for suspend/reactivate/remove), and a team count. Admin-gated.
// DATA MINIMISATION: returns the operational-area *description* only, never
// precise field-worker coordinates — operators don't need live positions here.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSessionFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  const { id } = await params
  const supabase = createServiceClient()

  // deleted_at is additive — select it, fall back without it pre-migration.
  const cols = 'id, name, type, country, status, operational_area, share_team_presence, share_operational_area, created_at'
  let r: any = await supabase.from('ngo_organisations').select(`${cols}, deleted_at`).eq('id', id).maybeSingle()
  if (r.error && (r.error.code === '42703' || r.error.code === 'PGRST204')) {
    r = await supabase.from('ngo_organisations').select(cols).eq('id', id).maybeSingle()
  }
  const { data: org, error } = r
  if (error) return NextResponse.json({ error: 'Could not load organisation' }, { status: 500 })
  if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })

  const [{ data: users }, { count: teamCount }] = await Promise.all([
    supabase
      .from('ngo_users')
      .select('id, full_name, email, role, status, created_at')
      .eq('org_id', id)
      .order('created_at', { ascending: true }),
    supabase.from('ngo_teams').select('*', { count: 'exact', head: true }).eq('org_id', id),
  ])

  // Reduce the operational_area GeoJSON to a plain description / presence flag —
  // never hand the raw polygon/coordinates to the oversight UI.
  const areaDescription =
    org.operational_area && typeof org.operational_area === 'object'
      ? (org.operational_area as { description?: string }).description ?? 'Area defined'
      : null

  return NextResponse.json(
    {
      org: {
        id: org.id,
        name: org.name,
        type: org.type,
        country: org.country,
        status: org.status,
        created_at: org.created_at,
        deleted_at: (org as any).deleted_at ?? null,
        area_description: areaDescription,
        share_team_presence: org.share_team_presence,
        share_operational_area: org.share_operational_area,
        team_count: teamCount ?? 0,
      },
      users: users ?? [],
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
