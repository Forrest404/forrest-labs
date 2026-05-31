import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

// Platform-scoped audit reader: only NGO-oversight entries (entity_type
// ngo_organisation / ngo_user). Kept separate from /api/admin/audit so the
// civilian audit page/API stay untouched. Admin-gated, read-only.
const PLATFORM_ENTITY_TYPES = ['ngo_organisation', 'ngo_user']

export async function GET(request: NextRequest) {
  const admin = await getSessionFromRequest(request)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })

  const supabase = createServiceClient()
  const sp = request.nextUrl.searchParams
  const limit = Math.min(parseInt(sp.get('limit') ?? '50', 10), 100)
  const offset = parseInt(sp.get('offset') ?? '0', 10)

  const { data, count, error } = await supabase
    .from('admin_audit_log')
    .select('id, created_at, action, entity_type, entity_id, actor, details', { count: 'exact' })
    .in('entity_type', PLATFORM_ENTITY_TYPES)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('platform audit load failed:', error)
    return NextResponse.json({ error: 'Could not load audit log' }, { status: 500 })
  }

  return NextResponse.json(
    { entries: data ?? [], total: count ?? 0 },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
