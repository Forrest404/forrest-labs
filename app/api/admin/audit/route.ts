import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const searchParams = request.nextUrl.searchParams

  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)
  const offset = parseInt(searchParams.get('offset') ?? '0')
  const action = searchParams.get('action')
  const entityType = searchParams.get('entity_type')
  const search = searchParams.get('search')
  const days = searchParams.get('days') ?? '30'

  let query = supabase
    .from('admin_audit_log')
    .select(
      'id, created_at, action, entity_type, entity_id, actor, ip_hash, details',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (action) {
    query = query.eq('action', action)
  }
  if (entityType) {
    query = query.eq('entity_type', entityType)
  }
  if (search) {
    query = query.textSearch('details', search)
  }
  if (days !== 'all') {
    const cutoff = new Date(Date.now() - parseInt(days) * 86400000).toISOString()
    query = query.gte('created_at', cutoff)
  }

  const [{ data, count }, { data: actionCounts }] = await Promise.all([
    query,
    supabase
      .from('admin_audit_log')
      .select('action')
      .gte('created_at', new Date(Date.now() - 86400000).toISOString()),
  ])

  const summary: Record<string, number> = {}
  actionCounts?.forEach((r) => {
    summary[r.action as string] = (summary[r.action as string] ?? 0) + 1
  })

  return NextResponse.json(
    { entries: data ?? [], total: count ?? 0, action_summary: summary },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
