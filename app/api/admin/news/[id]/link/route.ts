import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'
import { writeAuditLog } from '@/lib/admin/audit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { id } = await params

  let body: { cluster_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { cluster_id } = body
  if (!cluster_id || typeof cluster_id !== 'string') {
    return NextResponse.json({ error: 'cluster_id required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('news_articles')
    .update({
      linked_cluster_id: cluster_id,
      status: 'linked',
      match_confidence: 100,
    })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Failed to link article' }, { status: 500 })
  }

  await writeAuditLog({
    action: 'cluster_viewed',
    entityType: 'news_article',
    entityId: id,
    sessionId: session.sessionId,
    notes: 'Article manually linked to cluster',
  })

  return NextResponse.json({ success: true })
}
