import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

// PATCH /api/ngo/contacts/[id] — update a contact (managers only, org-scoped).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) {
    const name = (body.name ?? '').toString().trim()
    if (!name) return NextResponse.json({ error: 'A name is required.' }, { status: 400 })
    update.name = name.slice(0, 160)
  }
  if (body.organisation !== undefined) update.organisation = str(body.organisation)
  if (body.role !== undefined) update.role = str(body.role)
  if (body.phone !== undefined) update.phone = str(body.phone)
  if (body.notes !== undefined) update.notes = str(body.notes)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('contacts')
    .update(update)
    .eq('id', id)
    .eq('org_id', session!.orgId)
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}

// DELETE /api/ngo/contacts/[id] — remove a contact (managers only, org-scoped).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', id)
    .eq('org_id', session!.orgId)
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}

function str(v: unknown): string | null {
  const s = (v ?? '').toString().trim()
  return s ? s.slice(0, 500) : null
}
