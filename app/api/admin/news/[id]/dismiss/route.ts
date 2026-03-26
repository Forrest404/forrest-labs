import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

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
    .from('news_articles')
    .update({ status: 'dismissed' })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Failed to dismiss article' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
