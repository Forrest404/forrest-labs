import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { id } = await params
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('reports')
    .update({ media_status: 'approved' })
    .eq('id', id)

  if (error) {
    console.error('[admin/media/approve]', error.message)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  await supabase.from('admin_audit_log').insert({
    action: 'cluster_viewed',
    entity_type: 'media',
    entity_id: id,
    actor: session.sessionId.slice(0, 8) + '...',
    details: 'Media approved',
  })

  return NextResponse.json({ success: true })
}
