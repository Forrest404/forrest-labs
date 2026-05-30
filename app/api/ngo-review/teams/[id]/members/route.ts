import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

// NOUR-internal: members of any team (admin-gated, cross-org).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSessionFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  const { id } = await params

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_members')
    .select('id, name, role, phone, emergency_contact, ngo_user_id, created_at')
    .eq('team_id', id)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: 'Could not load members' }, { status: 500 })
  return NextResponse.json({ members: data ?? [] })
}
