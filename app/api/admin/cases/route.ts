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

  const cleanTitle = (title ?? '').toString().trim()
  if (!cleanTitle) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }
  // Cap untrusted text + bound the arrays so an oversized payload can't be persisted.
  const cleanDescription = description != null ? String(description).slice(0, 20000) : null
  const cleanClusterIds = Array.isArray(cluster_ids) ? cluster_ids.slice(0, 500) : []
  const cleanTags = Array.isArray(tags) ? tags.slice(0, 50).map((t) => String(t).slice(0, 80)) : []

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('case_files')
    .insert({
      title: cleanTitle.slice(0, 300),
      description: cleanDescription,
      cluster_ids: cleanClusterIds,
      tags: cleanTags,
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
