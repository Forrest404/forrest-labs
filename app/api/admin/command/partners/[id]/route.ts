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

  let body: { email?: string; role?: string; active?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.email !== undefined) updates.email = body.email.toLowerCase().trim()
  if (body.role !== undefined) updates.role = body.role
  if (body.active !== undefined) updates.active = body.active

  const supabase = createServiceClient()
  const { error } = await supabase.from('partner_accounts').update(updates).eq('id', id)

  if (error) {
    console.error('[partners/patch]', error.message)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
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
    .from('partner_accounts')
    .update({ active: false })
    .eq('id', id)

  if (error) {
    console.error('[partners/delete]', error.message)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
