import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

// Admin-gated (existing fl_admin_session) list of NGO orgs awaiting approval.
export async function GET(request: NextRequest) {
  const admin = await getSessionFromRequest(request)
  if (!admin) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: orgs } = await supabase
    .from('ngo_organisations')
    .select('id, name, type, country, operational_area, status, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  const pending = orgs ?? []

  // Attach the org_admin contact for each pending org.
  const withAdmins = await Promise.all(
    pending.map(async (org) => {
      const { data: adminUser } = await supabase
        .from('ngo_users')
        .select('full_name, email, phone')
        .eq('org_id', org.id as string)
        .eq('role', 'org_admin')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      return { ...org, admin: adminUser ?? null }
    }),
  )

  return NextResponse.json({ organisations: withAdmins })
}
