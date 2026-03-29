import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { id } = await params

  let body: { quantity_available?: number; quantity_total?: number; notes?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.quantity_available !== undefined) updatePayload.quantity_available = body.quantity_available
  if (body.quantity_total !== undefined) updatePayload.quantity_total = body.quantity_total
  if (body.notes !== undefined) updatePayload.notes = body.notes

  const supabase = createServiceClient()
  const { error } = await supabase.from('resources').update(updatePayload).eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
