import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { validateChatUrl } from '@/lib/ngo-chat'

const PLATFORMS = ['signal', 'whatsapp', 'telegram', 'other']

// PATCH /api/ngo/chat/[id] — update a link (managers only, org-scoped).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const orgId = session!.orgId
  const { id } = await params
  const supabase = createServiceClient()

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.label !== undefined) {
    const label = (body.label ?? '').toString().trim()
    if (!label) return NextResponse.json({ error: 'A label is required.' }, { status: 400 })
    if (label.length > 120) return NextResponse.json({ error: 'Label is too long.' }, { status: 400 })
    update.label = label
  }
  if (body.url !== undefined) {
    const v = validateChatUrl((body.url ?? '').toString())
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    update.url = v.url
    // Re-infer platform from the new URL unless an explicit valid one is provided.
    update.platform = PLATFORMS.includes(body.platform) ? body.platform : v.platform
  } else if (body.platform !== undefined && PLATFORMS.includes(body.platform)) {
    update.platform = body.platform
  }
  if (body.description !== undefined) {
    update.description = (body.description ?? '').toString().trim().slice(0, 500) || null
  }
  if (body.scope !== undefined) {
    const scope = body.scope === 'team' ? 'team' : 'org'
    update.scope = scope
    if (scope === 'team') {
      const teamId = (body.team_id ?? '').toString() || null
      if (!teamId) return NextResponse.json({ error: 'A team is required for a team-scope link.' }, { status: 400 })
      const { data: team } = await supabase.from('ngo_teams').select('id').eq('id', teamId).eq('org_id', orgId).maybeSingle()
      if (!team) return NextResponse.json({ error: 'That team was not found in your organisation.' }, { status: 400 })
      update.team_id = teamId
    } else {
      update.team_id = null
    }
  }

  const { data, error } = await supabase
    .from('chat_links')
    .update(update)
    .eq('id', id)
    .eq('org_id', orgId) // org-scope: cannot edit another org's link
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}

// DELETE /api/ngo/chat/[id] — remove a link (managers only, org-scoped). UI confirms.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('chat_links')
    .delete()
    .eq('id', id)
    .eq('org_id', session!.orgId)
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
