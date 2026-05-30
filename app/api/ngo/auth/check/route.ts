import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession } from '@/lib/ngo-auth'

// Session probe for the NGO client: role + who's signed in (name + org), used by
// the layout to gate nav and render the logout control. 401 once revoked.
export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const supabase = createServiceClient()
  const { data: user } = await supabase
    .from('ngo_users').select('full_name, email').eq('id', session.userId).maybeSingle()
  const { data: org } = await supabase
    .from('ngo_organisations').select('name').eq('id', session.orgId).maybeSingle()
  return NextResponse.json({
    role: session.role,
    org_id: session.orgId,
    name: user?.full_name || user?.email || 'Signed in',
    org_name: org?.name ?? null,
  })
}
