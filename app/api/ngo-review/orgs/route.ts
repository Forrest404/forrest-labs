import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

// NOUR-internal: every organisation (any status) with counts + admin contact.
export async function GET(request: NextRequest) {
  const admin = await getSessionFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })

  const supabase = createServiceClient()
  const { data: orgs, error } = await supabase
    .from('ngo_organisations')
    .select('id, name, type, country, status, created_at, ngo_users ( count ), ngo_teams ( count )')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('admin orgs load failed:', error)
    return NextResponse.json({ error: 'Could not load organisations' }, { status: 500 })
  }

  const countOf = (v: any) => (Array.isArray(v) ? v[0]?.count ?? 0 : v?.count ?? 0)
  const withAdmins = await Promise.all(
    (orgs ?? []).map(async (o: any) => {
      const { data: adminUser } = await supabase
        .from('ngo_users')
        .select('full_name, email, phone')
        .eq('org_id', o.id)
        .eq('role', 'org_admin')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      return {
        id: o.id,
        name: o.name,
        type: o.type,
        country: o.country,
        status: o.status,
        created_at: o.created_at,
        user_count: countOf(o.ngo_users),
        team_count: countOf(o.ngo_teams),
        admin: adminUser ?? null,
      }
    }),
  )

  return NextResponse.json({ organisations: withAdmins })
}
