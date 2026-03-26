import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const [{ data: reliable }, { data: flagged }] = await Promise.all([
    supabase
      .from('source_reliability')
      .select('*')
      .gte('total_reports', 3)
      .order('reliability_score', { ascending: false })
      .limit(20),
    supabase
      .from('source_reliability')
      .select('*')
      .eq('flagged', true)
      .order('rejected_reports', { ascending: false })
      .limit(20),
  ])

  return NextResponse.json(
    { reliable: reliable ?? [], flagged: flagged ?? [] },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
