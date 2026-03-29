import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('case_files')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[admin/cases]', error.message)
    return NextResponse.json({ error: 'Failed to fetch cases' }, { status: 500 })
  }

  return NextResponse.json({ cases: data ?? [] })
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: {
    title?: string
    description?: string
    cluster_ids?: string[]
    tags?: string[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { title, description, cluster_ids, tags } = body

  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('case_files')
    .insert({
      title,
      description: description ?? null,
      cluster_ids: cluster_ids ?? [],
      tags: tags ?? [],
      created_by: session.sessionId.slice(0, 8),
      status: 'open',
    })
    .select()
    .single()

  if (error) {
    console.error('[admin/cases]', error.message)
    return NextResponse.json({ error: 'Failed to create case' }, { status: 500 })
  }

  return NextResponse.json({ success: true, case: data })
}
