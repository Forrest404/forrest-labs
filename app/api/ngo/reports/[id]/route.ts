import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

// GET one saved report (full draft + data snapshot) for viewing / re-export.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('ngo_reports')
    .select('id, title, period_start, period_end, created_at, draft, data')
    .eq('id', id)
    .eq('org_id', session!.orgId) // org-scope: cannot read another org's report
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not load report' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  return NextResponse.json({ report: data }, { headers: { 'Cache-Control': 'no-store' } })
}

// DELETE a saved report (org-scoped). UI confirms before calling.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('ngo_reports')
    .delete()
    .eq('id', id)
    .eq('org_id', session!.orgId)
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
