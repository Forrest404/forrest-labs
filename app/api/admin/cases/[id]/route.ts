import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { id } = await params
  const supabase = createServiceClient()

  const { data: caseFile, error } = await supabase
    .from('case_files')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !caseFile) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  }

  const clusterIds = caseFile.cluster_ids as string[]
  let clusters: Record<string, unknown>[] = []

  if (clusterIds.length > 0) {
    const { data } = await supabase
      .from('clusters')
      .select(
        `
        id, location_name, status,
        confidence_score, report_count,
        created_at, centroid_lat,
        centroid_lon, ai_reasoning
      `,
      )
      .in('id', clusterIds)

    clusters = data ?? []
  }

  return NextResponse.json({ case: caseFile, clusters })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { id } = await params

  let body: {
    title?: string
    description?: string
    status?: string
    cluster_ids?: string[]
    tags?: string[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.title !== undefined) updates.title = body.title
  if (body.description !== undefined) updates.description = body.description
  if (body.status !== undefined) updates.status = body.status
  if (body.cluster_ids !== undefined) updates.cluster_ids = body.cluster_ids
  if (body.tags !== undefined) updates.tags = body.tags

  const { data, error } = await supabase
    .from('case_files')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[admin/cases/patch]', error.message)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true, case: data })
}

export async function DELETE(
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
    .from('case_files')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.error('[admin/cases/delete]', error.message)
    return NextResponse.json({ error: 'Archive failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
